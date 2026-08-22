---
status: blocked
story: 7-6 Design & Doc Reconciliation
cycle: 126 (proposed)
version_at_gate: 0.17.125
protocol_version_at_gate: 47
date: 2026-08-21
blocking_condition: intent gaps — 7-6 is a with-Eric pass by its own AC; 28 decisions listed below
---

# Story 7-6 question gate — Design & Doc Reconciliation

Story 7-6's own acceptance criteria say the refresh pass runs **"(with Eric — it's the design
source of truth)"**. This is that gate. Nothing has been edited yet.

Seven parallel audits ran read-only over DESIGN.md, EXPERIENCE.md, the GDD, `game-architecture.md`,
CLAUDE.md, both tracker files and the 406 KB deferred-work ledger, cross-checked against six epics
of ratified amendments and against the shipped code. Every claim below carries a `file:line`.

## How to answer

Answer by tag — `A1 yes`, `B1 option 2`, `C3 drop it`. Anything you skip, I take the
**Recommended** line and record it as an implementer default in the amendment entry, so a skipped
answer is still auditable. Sections **A** and **B** genuinely gate the rest; the others can be
answered in any order.

---

## The three things worth knowing before you answer

**1. The story is bigger than its own AC text, because Epic 7 was renumbered.**
After the 2026-08-18 rescope, the epic-6 retro's *"Story 7.5 doc-sync batch"* became today's **7.6**,
and its *"7.6 release gate"* became today's **7.8**. Today's 7.5 is Upgrade Cards v2, which shipped
at cycle 109 and absorbed none of the doc-sync. So five ledger entries routed to "7-5" are real 7-6
work sitting orphaned (`deferred-work.md:423, 474, 507, 600, 821`), and two entries that name 7-6 as
their home are really 7.8's (`:1065-1067` `loadTest.mjs`, `:1154` the solo-create cost vector). Real
surface: **~17 documentation surfaces**, not the six the AC lists. The epic-6 retro predicted this.

**2. This pass found a live defect in something that shipped yesterday.**
Cycle 125's palette regeneration put four player hues inside bands DESIGN.md reserves. That is
question **B1**, and it is the one item here where the doc is right and the *code* is wrong.

**3. CLAUDE.md — the file every AI session in this repo loads as ground truth — is materially wrong.**
Not stylistically: `PROTOCOL_VERSION` is stated as 41 when it is **47**; `rollOffer()` is documented
as the offer API and has **zero references**; `ui/menu.ts` is listed and **does not exist**;
`UPGRADE_IDS`/`UPGRADE_CATEGORIES` are listed and were **deleted**; the production connect path is
listed as `joinOrCreate('arena')` when it is `joinOrCreate('queue')`; **15 `shared/` modules**, four
`equipment/` files and five whole client directories are missing. Every agent that has worked in
this repo recently has been reading some of this as fact.

---

## Section A — Scope (gates everything else)

### A1 — Does 7-6 take the full reconciliation surface, or only its AC's named list?

The AC names: DESIGN.md hex-era content, the resolved open questions, the GDD correction flags, the
Epic 6 UX additions, the portal/Chromebook sweep, and the trackers. The audits found that much plus
the twelve orphaned/unhomed doc-drift entries in §1 above (DESIGN.md typography rows superseded by
epic-2 amendments 15-17; the "purple only for the storm" law needing amendment 49's carve-out named;
the Color Hoist still documented on the home page; a ratified mockup rendering the chrome bar in
retired greys; the pip scheme; the missing DAMAGE CONTROL rail row; the Listening Ring still
ratified Tier-1 in three docs; NFR6's 12:00 closure).

- **Option 1 (Recommended)** — take the full surface in one pass. It is all the same class of work,
  and splitting it means a second reconciliation cycle later that has to re-derive the same evidence.
- **Option 2** — AC list only; I file the remainder as a explicitly-homed ledger batch for a later cycle.

### A2 — May I correct the ledger's story misattributions as part of this cycle?

Mechanical bookkeeping, but it moves work between stories, so it is your call: re-home
`deferred-work.md:423, 474, 507, 600, 821, 182` to **7-6**, and `:1065-1067, :1154` to **7.8**.
Also `:158` and `:1099` point at "7.4"/"7-4" for the How-to-Play page, which is **7.3**.

- **Recommended: yes** — otherwise 7.8 inherits two items it does not know it owns, and five real
  7-6 items stay invisible.

---

## Section B — The live defect (needs a call before DESIGN.md can be written)

### B1 — Cycle 125's regenerated palette violates DESIGN.md's reserved bands

I verified this by hand, independently of the audit that raised it.

`DESIGN.md:168` reserves, as a design law: amber (~25–52°), the red family (~345–25°), storm violet
(~266–286°), **and the phosphor-green band (~±20° around `#00FF88`, ≈132–172°)** — and states
explicitly that *"Spring, Jade, and Aqua were shifted off the phosphor band per validation."*
`shared/src/constants.ts:1998` restates that all four bands are *"excluded by wheel construction."*

Measured on the cycle-125 values now in `DESIGN.md:60-79` and `client/src/config.ts:130-149`:

| hue | hex | angle | band | saturation |
|---|---|---|---|---|
| `player-green` | `#12B563` | **149.8°** | inside phosphor (132–172°) | 0.90 |
| `player-spring` | `#10A981` | **164.3°** | inside phosphor | 0.91 |
| `player-jade` | `#0D9582` | **171.6°** | inside phosphor | 0.91 |
| `player-orchid` | `#AD58FD` | **270.9°** | inside storm-violet (266–286°) | — |

Pre-125 these were green 120°, jade 174.6°, orchid 293.4° — all outside. Amendment 37 asserts only
that *"the reserved **red/amber** band stays empty"* and never mentions phosphor or storm violet.
Nothing caught it because **no test pins the Regatta wheel against the band predicate** — the
predicate exists (`client/src/__tests__/tokens.test.ts:432-441`, `BAND_HALF = 20`,
`BAND_MIN_SAT = 0.35`) but is only applied to combat-effect tokens (`:472-484`) and the heatmap
ramp (`:498`).

Why it matters in play: the phosphor band is reserved so a player hue can never be mistaken for a
radar return or HUD chrome — DESIGN.md's own phrasing elsewhere is *"a phosphor-ish splash is a fake
blip."* Three of twenty captains now wear very close to blip green.

- **Option 1** — re-place the four hues (regenerate with the band constraint actually enforced) and
  add the missing pin. Code + doc; roughly a cycle-125-sized job. *This preserves a ratified law.*
- **Option 2 (Recommended if you like how it looks on the water)** — amend the reservation to
  red/amber only, in both `DESIGN.md:168` and `constants.ts:1997-1998`, and record why. Doc-only,
  but it retires a design law deliberately rather than by accident.
- **Option 3** — leave both as they are and ledger the contradiction. *Not recommended:* it leaves
  two documents asserting something false about the shipped build.

Either way I will add the missing test, so this cannot recur silently.

---

## Section C — DESIGN.md

DESIGN.md has **no hex-era design sections left** (verified — the only "hex" hits are colour codes
and two explicit retirement notes at `:125`/`:131`/`:139`). The hex problem lives in the root
`/DESIGN.md` instead — see **G6**. What DESIGN.md has instead is nine contradictions with the
shipped game, listed under "needs no ruling" below where the code is unambiguous. These four need you.

### C1 — Island colours: ratify the hypsometric ramp, or keep it provisional?
The old provisional tokens are gone from the code — `client/src/config.ts:55-62` deletes
`islandFill`/`islandStroke` by name and says the DESIGN.md Open Question is *"resolved BY DELETION."*
What paints now is the four-band ramp at `client/src/config.ts:78-83` (shore `#4a6b33`/`#242f22`,
low slope `#7b8a3e`/`#363c29`, upland `#ae9c58`/`#484534`, summit `#dcd2ac`/`#5b5a52`). You ratified
the **grammar** on 2026-08-06 (each band outlined in its solid scale colour, filled with a darker
version; four bands is the ceiling). The **twelve specific hexes were chosen by the implementer**
from rendered comparison, never by you.

- **Option 1 (Recommended)** — write the twelve in as ratified tokens, retiring `island-fill`/`island-stroke`.
- **Option 2** — write them in marked provisional pending your eye on the water.

### C2 — DESIGN.md:166 still lists the pre-regeneration hull pairs
Twelve stale outline→fill pairs (`Cyan #00D0FF→#005E73` …) plus `[ASSUMPTION] The remaining 8 fills
are computed by the same ~45%-value rule; no documented hexes exist yet.` Amendment 37 collapsed all
twenty fills to one ×0.45 rule, so the split the assumption describes no longer exists. This is
amendment 37's one genuine miss.
- **Recommended:** replace the list with the single derivation rule and delete the `[ASSUMPTION]`.
  Confirm and I'll treat it as mechanical.

### C3 — The Chromebook rider at DESIGN.md:186
`"Decay ghosts: ≤3 per contact, TTL-based (also the Chromebook perf guard)."` The cap is real and
shipped; only the justification is retired.
- **Option 1 (Recommended)** — drop the parenthetical, keep the cap as a legibility rule.
- **Option 2** — re-cite it against the current reference device (the i7 MacBook Pro 16,1).

### C4 — Four component-table gaps
No **Foghorn Chevron** row (the shipped replacement for the deferred Listening Ring); no **DAMAGE
CONTROL rail** row at all; no advertising/consent tokens (Epic 7 shipped a consent dialog and a
score-screen ad unit that DESIGN.md never describes); and `:240` references
`{components.aggro-bracket}`, a token with no frontmatter key.
- **Recommended:** add the three missing rows and fix the dangling token. The rows describe shipped
  surfaces, so no new design is being invented — but say the word if you'd rather these wait for a
  design pass where you can look at them.

---

## Section D — EXPERIENCE.md: bindings and copy

### D1 — Is `Tab` + digits the ratified refit binding? (the biggest doc-vs-doc conflict in the repo)
EXPERIENCE.md still specifies **hold SPACE** to refit, in nine places (`:42, :60, :65, :100, :114,
:115, :116, :128, :208, :209`), and `UX-DR14` calls hold-not-toggle **"absolute"**. Shipped for
months: **Tab toggles** the window (`client/src/input/keyboard.ts:351`), **1–4** pick, **5** is
DAMAGE CONTROL (`:102`, `HEAL_CHOICE`), and Space is bound-inert. **No amendment in any epic ever
ruled this change** — it appears to be undocumented drift that then became the played game.
- **Option 1 (Recommended)** — adopt Tab as ratified; retire UX-DR14's absolute clause and UX-DR12's
  "HOLD SPACE TO REFIT" cue copy; add the missing digit-5 heal entry.
- **Option 2** — the code owes a revert to SPACE-hold.

### D2 — Ratify or replace two DRAFT strings
Both are implementer drafts that shipped unratified, and epic-6 amendment 41 says only you may
author copy:
- `COULD NOT REJOIN YOUR MATCH — BACK IN PORT` (home status line; `client/src/net/connection.ts:623`)
- `UNKNOWN VESSEL` (nameplate/feed fallback)
- **Recommended:** ratify both as-is — they hold the register. Replace either if you'd rather.

### D3 — Write epic-6 amendment 41's copy law into EXPERIENCE.md's Voice and Tone?
The law: *"a ruling to put information somewhere is NOT a licence to author the copy that goes
there… the answer is to leave it empty and ask."* EXPERIENCE.md never states it; the nearest
sentence (`:53`) is weaker.
- **Recommended: yes**, quoted verbatim from the amendment so I'm not paraphrasing your rule.

### D4 — The D6 "steer toward Solo vs AI" lost its only copy
When you deleted `STARTS INSTANTLY` (amendment 50), the D6 steer lost its words.
- **Option 1 (Recommended)** — the SOLO VS AI door *is* the whole steer; delete the copy requirement.
- **Option 2** — you author a replacement line.

### D5 — Sudden death in player-facing prose
`EXPERIENCE.md:104` describes the endgame ring as the terminal state ("final ring = 2 truesight
diameters"). Since cycle 82 the map collapses to radius 0 at 16:00. Epic-3 amendment 27 superseded
only the *shrink* clause of amendment 24; the player-facing framing was never re-ruled.
- **Recommended:** describe both — the 660u endgame ring, then the collapse — since both are real.

---

## Section E — The GDD

### E1 — Smoke screen: deferred, or cut?
The GDD states it as content (`gdd.md:174`, `epics.md:21, 50, 51`). Epic-2 amendment 38 deferred it
past v1; epic-5 amendment 47 then declared the systems layer complete; your 7-5 catalog omits it.
- **Recommended:** restate as explicitly deferred (not cut), unless you're calling it cut.

### E2 — Precision bonus: drop, or keep as an open idea?
`gdd.md:199, :426` and `decision-log.md:94` carry it; E1 was to decide it and closed without a
ruling; nothing was ever built.
- **Recommended:** drop it from the GDD body, keep the decision-log entry as history.

### E3 — "instantly re-queue" survives in two places
`gdd.md:97` ("short enough to instantly re-queue") and `gdd.md:377` (a success metric: "Players
re-queue immediately after death") sit against epic-5 amendment 30: *"I DO NOT WANT INSTANT REQUE.
You MUST return to the home screen to requeue. MUST."* Also `gdd.md:106` still reads "then spectate
or instant re-queue".
- **Recommended:** reword all three to route through home. Confirm the *metric* at `:377` should
  also change — it may be a legitimate pacing goal ("players choose to play again quickly") rather
  than a claim about the flow.

### E4 — Hydrophones are stated as shipped design law
`gdd.md:142` calls them *"core kit on every hull … (design law, 2026-07-19)"*, reinforced at `:185`,
`:320`, `epics.md:101`. They were deferred 2026-08-04 and the listening ring does not exist
(`client/src/config.ts:1628` says so).
- **Recommended:** restate as deferred and point at the foghorn chevron as the shipped bearing surface.

### E5 — NFR6's match-length claim
`epics.md:96` still reads *"Matches complete inside ~15:00 (ring fully closed at ~12:00)"*. Sudden
death moved closure to **16:00**, measured worst case **16:43**. CLAUDE.md already flags NFR6 as
wrong but the NFR itself was never amended.
- **Recommended:** amend NFR6 to the 16:00 timeline with the measured worst case recorded.

---

## Section F — CLAUDE.md and the trackers

### F1 — May I run the suite once to stamp the true test count?
CLAUDE.md:12 says **5127** (a cycle-104 figure). A static count gives >5,436 literal `it`/`test`
calls plus `.each` expansions; the last measured figure in a spec is 5,439, before cycles 122–125.
- **Recommended: yes**, run `npm run check` once and stamp the real number.
  (Caveat of record: `radarHeatmap.test.ts` is known flaky and predates this work — epic-7
  amendment 33 — so the gate may need a re-run.)

### F2 — The versioning ruling stays put until 7.7 — confirming
`CLAUDE.md:130` carries *"the game stays 0.17.X until all 7 epics complete."* Story 7.7 retires it
(client and server each cut `0.1.0`, ledger rehomed to `sprint-status.yaml`), and 7.7 has not
shipped. Same for the Deploy Configuration block, which is accurate today and gets rewritten at 7.7.
- **Recommended:** leave both, and add a one-line "superseded at 7.7" pointer so the next reader
  isn't surprised.

### F3 — A duplicated tracker stamp citing a version that never existed
`sprint-status.yaml` records the **same** SOLO VS AI doctrine pass twice: once as *cycle 110 /
0.17.110 / amendment 29*, once as *cycle 120 / 0.17.120 / amendment 32*. I checked: **`0.17.120`
never existed** — no VERSION commit ever contained it. The real event is cycle 110 / `0.17.110`
(commit `b5d2f97`), recorded then as amendment 29 and renumbered to **32** at a later merge.
- **Recommended:** delete the spurious duplicate, correct the survivor's amendment number to 32.
  Mechanical; flagged only because it edits a ratified-looking record.

### F4 — The trackers violate their own one-line rule, massively
Your directive says each entry gets a status plus at most a one-line stamp.
`sprint-status.yaml:2` is a single line of **13,074 characters**. `gds-workflow-status.yaml:7` is
**24,801**, and its eight `superseded_next_expected_N` keys hold **~49,500 characters** of archived
narrative with no status function — only 7 of 56 lines are under 100 chars. Both are also stale:
`sprint-status.yaml:118` says `last_updated: 2026-08-19` (6 cycles ago) and both still open with
"epic-6 OPEN", false since 2026-08-18; `gds-workflow-status.yaml:43` says 7-5 landed as `0.17.108`
with amendments 19-27 (really `0.17.109`, amendments 20-28). Cycles 120–125 are unrecorded in the
structured body, and the "canonical" interstitial index stops at cycle 108.
- **Option 1 (Recommended)** — reformat both to the one-line rule, moving the narrative into the
  epic-7 amendment ledger where it belongs, and bring them current to cycle 126.
- **Option 2** — correct the facts only, leave the format. Cheaper, but the rule stays broken and
  these files stop being regenerable by `gds-sprint-planning`.

### F5 — Rewrite CLAUDE.md's Architecture inventory?
See "the three things worth knowing", item 3. Beyond the listed errors: `:41` claims nothing reads
the height raster (Story 4.11 consumes it — CLAUDE.md's own `:105` says so); `:44` says three storm
ring groups (four since cycle 82); `:53` describes drones as weaponless targets (rewritten to the
PvE fleet controller at Story 5.6); `:6` says the hex game "still lives on `main`" — we *are* on
main (same claim at `README.md:5`). Key Decisions stop at amendment 31 / cycle 119 while the ledger
runs to 37 / cycle 125, so balance cycle 122 (hull HP doubled to 250/350/300, PV 46→47) is absent —
which makes the sudden-death bullet's arithmetic wrong twice (`:112`: "a 175 hp battleship — the
game's maximum — sinks ~44s after 16:00"; it's 350 hp and ~87s, and a heal is 100 hp not 50, so
~25s per banked level not ~12.5s).
- **Recommended: yes**, full rewrite of the Architecture section plus the stale Key Decisions facts.

---

## Section G — The sweep's judgement calls

The portal/Chromebook sweep is **not** a find-and-delete: the rescope proposal, the decision logs,
the retros and the dated specs legitimately *record* that a portal launch was planned and retired,
and deleting that falsifies history. I'll preserve all of those. These six are the genuine calls.

### G1 — Does the sweep reach source comments?
`client/src/portal/portalAdapter.ts:1` still promises *"wired for real at Epic 7"*, plus four
comment references in `client/src/ads/`. AR11 deliberately retained the **interface name**
`PortalAdapter` (renaming ratified code to match a changed destination is churn) — but the comments
promise an integration that will never arrive.
- **Recommended:** update the comments (not the names), so the seam documents what it actually is.

### G2 — Is the product brief a dated artifact, or standing strategy?
`briefs/…/brief.md:363, 375, 379, 422, 438` state the *live* model as "ads-first … via the portals
(Poki, CrazyGames)" and make low-end perf "a distribution feature".
- **Option 1 (Recommended)** — dated artifact of record: add a superseding header, leave the body.
- **Option 2** — standing strategy: rewrite the body to self-published/AdSense.

### G3 — Do the UX review findings keep their severity?
`review-accessibility.md`, `review-hud-legibility.md`, `review-input-scheme.md`, `review-rubric.md`
and `validation-report.md` all use the Chromebook as the **reviewer lens and severity basis**
(1366×768 floor, 9 px → 8.1 px at 90% scale), and several findings are recorded **OPEN** and still
gate DESIGN.md.
- **Question:** with the reference device changed, does the severity of an open finding whose only
  justification was the Chromebook floor change with it — or does 1366×768 survive independently?
  (NFR7 and UX-DR39 still name that viewport, which argues it survives.)
- **Recommended:** the floor survives on its own terms; findings keep their severity; the *device*
  framing gets restated as the viewport floor.

### G4 — The epic-6 retro was written the same day as the rescope that invalidated it
`epic-6-retro-2026-08-18.md:1352, 1428, 1440, 1448, 1470-1471` head a section "Epic 7 Preview —
Portal Launch Readiness" and name "acquire the reference Chromebook" as your #1 action. It reads as
live guidance.
- **Recommended:** add a dated superseding stamp at the top; do not edit the body (a retro is a
  record of what was thought at the time).

### G5 — A closed decision whose reasoning has retired
`game-architecture.md:246-249` — the closed "no MCP engine" decision is supported by the portal gate
and Chromebook load. The conclusion stands; the reasons don't.
- **Recommended:** preserve the reasoning of record, add one line noting the premises changed and
  the conclusion was re-affirmed on other grounds.

### G6 — The root `/DESIGN.md` and `/TODOS.md`
Both are formally deprecated in CLAUDE.md and `project-context.md`, and the root DESIGN.md is
**wholly hex-era** — Grid Cell States, Placement/Planning/Resolution phases, the lot (25 hits). It
is the single largest stale artifact in the repo, and it shares a filename with the real source of
truth, which is exactly how someone reads the wrong one.
- **Option 1 (Recommended)** — delete both; they are superseded, and git history preserves them.
- **Option 2** — move to `_bmad-output/planning-artifacts/ux-designs/…/imports/` beside the existing
  `DESIGN-v0.16-root.md` archival copy.
- **Option 3** — leave, add a superseded banner at the top of each.

---

## Section H — The three genuinely-open UX questions

Of EXPERIENCE.md's 25 numbered Open Questions: **12 are resolved by ruling**, **7 by shipped code**,
**3 are overtaken**, and these **3 are still open**. (Full disposition in the appendix.) All three
are non-blocking — I can write the other 22 back as decisions regardless of your answers here.

### H1 — Kill-streak spectacle (OQ#9)
Sinking several ships quickly currently produces nothing beyond the kill feed and the persistent
KILL LEADER register. No ruling, no ledger entry, no code anywhere.
- (a) nothing — the KILL LEADER throne is the whole recognition surface **(Recommended)**
- (b) a self-private toast + audio sting, like the existing `YOU ARE THE KILL LEADER` toast
- (c) a centre-screen celebration beat — would need Story 4.8 attention-tier arbitration and a slice
  of the photosensitivity budget

### H2 — The third journey (OQ#12)
EXPERIENCE.md reserves a party/friend-group journey that was never written. DUO and TRIO are named
as future mode-row siblings (the row is built to take them) but are not scoped, and beta is Solo +
Solo vs AI.
- (a) write it now against DUO/TRIO as planned modes
- (b) delete it until a party mode is actually ruled in **(Recommended)**
- (c) leave standing as an explicitly non-blocking placeholder

### H3 — PvE fleet tier legibility (OQ#24)
All three fleet tiers (small/medium/large, worth ¼/½/¾ of a level) render in one grey
(`DRONE_STYLE`, `client/src/render/ships.ts:94`) with only chevron **size** distinguishing them.
Colour is structurally unavailable — drones are locked greyscale by ratified rule.
- (a) size alone is enough, ship as is **(Recommended — it's shipped and nobody has complained)**
- (b) three distinct grey values within the drone palette
- (c) a shape mark (chevron count / rank tick), following the precedent that threat and state ride shape

---

## What needs no ruling — the mechanical work already staged

Listed so you can see what the cycle does beyond the questions, and object if anything looks wrong.

**Factual corrections where the code is unambiguous:**
- `PROTOCOL_VERSION` 41 → **47** (CLAUDE.md:82); add the missing 46→47 bump (cycle 122).
- CLAUDE.md's offer description: `rollOffer()` → the shipped `BoonOffer` API; **"3 upgrades from 3
  distinct categories"** → **4 different card lines**. Amendment 38 killed the category-first roll
  outright (`shared/src/sim/offers.ts:2-5`), which also makes the inline comment at
  `constants.ts:1631` ("each from a distinct BOON_CATALOG category") stale — I'll fix that too.
- The same "distinct categories" error at `gdd.md:146`, `:264`, `epics.md:48`, and the one-per-slot
  mapping at `gdd.md:148`, `:435`.
- `gdd.md:148`'s `[NOTE FOR DESIGNER]` about stat-lifts-vs-qualitative-boons is marked unresolved
  but amendment 38 settled it (commons are stat cards; rares/exclusives are qualitative) — struck.
- `gdd.md:148` "ships no heal option in the economy" — false; heal is digit 5, 50 instant + 50
  pooled (`CONFIG.damageControl`).

**DESIGN.md contradictions with the shipped game** (code is the truth in each):
Listening Ring specced as live (deferred; foghorn chevron shipped) · "Four launch classes" incl.
Gunboat (three shipped) · kill feed 5 lines/6 s (6 lines/8 s) · "HOLD SPACE TO REFIT" cue copy
(pending **D1**) · refit card face (rarity/lineage/`current → next` + hover tooltip since 7-5) ·
"decoy buoys" as truth-markers (decoy role deleted) · two-way results banner (a draw wears `info`).

**EXPERIENCE.md contradictions:** results modal "single action, spectate deliberately absent, no
dead button" (shipped: SPECTATE + RETURN TO PORT, **ESC = SPECTATE**) · kill feed capacity ·
hotbar `Q/E/R/F` mapping (gun is slot 0 with no key; **F is the foghorn**) · foghorn "key unbound"
(it's **F**) · three ring groups → four · blips "personal-coloured (Variant C)" (heatmap bands by
return strength) · "radar never paints torpedoes" (the fish no, its **wake** yes) · 13 tones
(~33) · UX-DR30's sailable waiting room (frozen held start line) · `:67`'s home sub-line (deleted) ·
`:108`'s "absence, not placeholders" (scoped: honest zero renders, unavailability is absent) ·
Gunboat and decoy cameos in the journeys · six shipped surfaces the doc never describes (queue
modal, boarding, the liveness register, the SOLO VS AI door, How-to-Play, privacy/consent/ads).

**The portal/Chromebook sweep**, live-and-stale hits only: `game-architecture.md` (14 sites incl.
the requirements row, the perf bar, the scale-out justification, complexity driver 6, two open
"assumptions under audit", the placement law, and a source-tree map directing future files to
`pokiAdapter.ts`/`crazyAdapter.ts`) · `epics.md:251, 348-360` · `deferred-work.md:44-47, 61, 695,
1099, 1183` · `sprint-status.yaml:65, 460, 464` · `gds-workflow-status.yaml:41`.
**Preserved as historical:** the rescope proposal itself, the readiness report, all epic contexts
and retros, all dated specs, `render.yaml:33`, both decision logs.

**Writing back the 22 resolved open questions** as decisions, and **`README.md:1`** ("Hullcracker —
Real-Time Prototype" → the shipped register) plus a stamp on the dated mockup at
`mockups/home-class-picker-1.html:309`.

---

## Appendix — disposition of EXPERIENCE.md's 25 Open Questions

| # | Topic | Disposition | Decision to write back |
|---|---|---|---|
| 1 | Heal-as-upgrade | RULED | Heal exists but is **not a card**: separate always-available DAMAGE CONTROL strip, digit 5. Epic-2 amendments 58-64, 67 |
| 2 | GDD corrections | RULED | Both applied; residual instant-re-queue errors → **E3** |
| 3 | Supply drops | SHIPPED | Parked; the beat is a structural no-op with zero HUD trace (`zone.ts:10-11`) |
| 4 | Premium cosmetic colours | SHIPPED | No hue is gated; monetization shipped as AdSense only |
| 5 | Reference sites | OVERTAKEN | Table already rebuilt (`EXPERIENCE.md:233-241`) |
| 6 | Island colours | RULED | Four-band hypsometric ramp → **C1** |
| 7 | Storm edge | RULED | Solid live ring / dashed telegraph; epic-3 amendment 14 |
| 8 | Sound-event map | RULED | `audio/twinMap.ts`, exhaustive at type level. Residual: timbre listening pass (`deferred-work.md:788`) |
| 9 | Kill-streak spectacle | **OPEN** | → **H1** |
| 10 | `--player-color` CSS var | SHIPPED | Not adopted; inline hex via `textSafe()` at each site |
| 11 | Readiness-pressure indicator | OVERTAKEN | Queue replaced the premise; `CAPTAINS BOARDING — n ABOARD`, no denominator |
| 12 | Third journey | **OPEN** | → **H2** |
| 13 | Class-card pips | RULED (doc numbers stale) | TB 4/2/4 · BS **2/4/2** · ML 3/3/3; row is **ARMOR** |
| 14 | Boon copy | RULED | Your v2 catalog is canon; minimal face + hover tooltip |
| 15 | First-run default class | RULED | No default pushed; chip reads `SELECT CLASS` |
| 16 | Camera-zoom range | RULED | 0.5×–1.5× alive, 0.5×–1.0× spectate; epic-2 amendment 8 |
| 17 | Torpedo bridge signal | SHIPPED | Detect rung 247.5u + `wakeInnerBound` closes the `(detect, sight]` dead band |
| 18 | 150% UI scale | SHIPPED | Three tiers (90/100/125); 150% post-beta |
| 19 | Key remapping | SHIPPED | Post-beta, stated in code |
| 20 | Foghorn key | RULED | **F**; epic-4 amendment 56 |
| 21 | Text-safe variant table | SHIPPED | No table — algorithmic `textSafe()`; inert for all 20 post-125 |
| 22 | Nameplate scope | RULED | All ships; drones literal `DRONE` in grey |
| 23 | Whirlpools | OVERTAKEN | Story 5.5 deferred by your ruling; systems layer declared complete |
| 24 | PvE drone tiers | **OPEN** (premise corrected) | → **H3** |
| 25 | Reveal-zoom motion exemption | RULED | **Not** exempt; motion scales duration, never destination |

---

# Eric's rulings — first pass, 2026-08-21

Verbatim answers, with the consequence each one carries. Three items remained open at the end of
this pass (**E2**, **F4**, **H3 scope**) and are marked as such.

| Tag | Ruling | Consequence |
|---|---|---|
| **A1** | "full" | Full ~17-surface reconciliation, including the twelve orphaned/unhomed ledger entries |
| **A2** | "yes" | Ledger re-homing proceeds |
| **B1** | *"ima be real, i see myself probably expanding the colors and some other shit in the future. Lets maybe just get rid of the 'law' here."* | **Option 2 — the phosphor-green and storm-violet reservations are RETIRED.** Red/amber stays reserved. The cycle-125 wheel is ratified as shipped; no hue moves. `DESIGN.md:168` and `shared/src/constants.ts:1997-1998` are rewritten to reserve red/amber only, and the new test pins the wheel against **that** band set. Rationale of record: the reservation existed to keep a player hue from reading as a radar return, and Eric has accepted that trade in exchange for room to expand the palette later |
| **C1** | "yes" | The four-band hypsometric ramp enters DESIGN.md as ratified tokens; `island-fill`/`island-stroke` retired |
| **C2** | *"idk what you're talking about"* → explained, default taken | `DESIGN.md:166`'s twelve pre-regeneration pairs and the `[ASSUMPTION]` are replaced by the single ×0.45 derivation rule |
| **C3** | *"yeah im not buying a chromebook for this"* | The `:186` Chromebook rider is dropped; the ≤3-ghost cap stands as a legibility rule |
| **C4** | "yes" | Foghorn Chevron, DAMAGE CONTROL rail and advertising/consent rows added; `{components.aggro-bracket}` fixed |
| **D1** | "yes" | **Tab + 1–4 + 5 is ratified.** UX-DR14's "hold-not-toggle (absolute)" and UX-DR12's "HOLD SPACE TO REFIT" are retired; nine EXPERIENCE.md passages corrected; the digit-5 heal entry added |
| **D2** | *"Sure? When does UNKNOWN VESSEL show up again?"* | **Ratified.** Investigated and answered: the string can never name a captain — `syncRoster()` mirrors every `PlayerMeta` row to every client every tick, and Story 6-7 keeps a departing captain's row alive past their seat expressly so a departure does not read as UNKNOWN VESSEL (`ArenaRoom.ts:222-237`). It renders only for a PvE fleet hull that is neither ours nor ever sighted. A seen drone reads `SMALL/MEDIUM/LARGE DRONE`. Eric's requirement — always see who killed who — already holds |
| **D3** | "uh ok" | Epic-6 amendment 41's copy law is quoted verbatim into EXPERIENCE.md's Voice and Tone |
| **D4** | *"yeah delete the copy requirement"* | The SOLO VS AI door is the whole D6 steer |
| **D5** | "yes" | Ring prose describes both the 660u endgame ring and the collapse |
| **E1** | *"Deferred, I think it will probably come back at some point"* | Smoke screen restated as deferred, not cut |
| **E2** | *"i dont remember what this was?"* | **STILL OPEN** — explained (a gun shell striking the clicked spot deals bonus damage; one that collides en route or catches a dodger deals base). Never built, never ruled. Recommendation: drop from the GDD body, keep the decision-log entry |
| **E3** | "change" | All three instant-re-queue sites reworded to route through home |
| **E4** | *"very deferred. sonar might come back in the future, but radar is plenty deep enough"* | Hydrophones restated as deferred; the foghorn chevron named as the shipped bearing surface; the "design law" framing struck |
| **E5** | *"~15 minutes is still accurate, that is the estimated game time. The theoretical max is a little over 17 right now I think."* | **Eric is right; the implementer recommendation was wrong.** Verified: ring fully closed 16:00, a 350 hp hull at 4 hp/s sinks ~87 s later ≈ **17:28**. NFR6 keeps ~15:00 as the estimate and gains a ~17:30 structural ceiling. CLAUDE.md's version is stale twice (175 hp hull, 50 hp heal — both doubled at cycle 122) and is corrected under F5 |
| **F1** | "ok" | The suite is run once and the true count stamped |
| **F2** | *"yeah, IF i decide to keep 7-7 as is, im thinking"* | Versioning ruling and Deploy Configuration left untouched; the "superseded at 7.7" pointer is written as conditional, since 7.7 itself may change |
| **F3** | "sure" | The spurious `0.17.120` duplicate is deleted; the survivor's amendment number corrected 29 → 32 |
| **F4** | "What?" | **STILL OPEN** — explained (13,074- and 24,801-character single lines; ~49,500 chars of dead narrative in eight archived keys; only 7 of 56 lines under 100 chars). Recommendation: reformat both, narrative moved to the amendment ledger |
| **G1** | *"I'm controlling my game and servers. no portals. IDGAF what you do. I'm serving my own ads."* | Source comments updated to describe the seam as it is; the `PortalAdapter` interface NAME is retained per AR11 |
| **G2** | "dated" | The brief gets a superseding header; its body is left as the artifact of record |
| **G3** | *"Idgaf about the chromebook"* | The device framing is restated as the 1366×768 viewport floor, which survives independently (NFR7/UX-DR39 name it); open findings keep their severity |
| **G4** | "Yes" | Dated superseding stamp on the epic-6 retro; body untouched |
| **G5** | "whatever" | Reasoning of record preserved; one line notes the premises changed and the conclusion was re-affirmed on other grounds |
| **G6** | "delete both" | Root `/DESIGN.md` and `/TODOS.md` are deleted; git history preserves them |
| **H1** | "Yep" | No kill-streak spectacle; the KILL LEADER throne is the whole recognition surface |
| **H2** | *"Doesn't matter now, those come after beta launch. K.I.S.S."* | The third journey is deleted from EXPERIENCE.md until a party mode is ruled in |
| **H3** | *"We actually do need better distinction, size isn't enough. Shape mark isn't a bad idea, or whatever you think?"* | **PARTIALLY OPEN — decision taken, scope pending.** Colour is unavailable (drones locked greyscale). Proposal: the nameplate reads `SMALL/MEDIUM/LARGE DRONE`, reusing the vocabulary already ratified for the kill feed, plus **rank ticks** (1/2/3 marks on the silhouette) so tier survives at blip scale where no nameplate exists. This is a RENDER change, not documentation — 7-6 records the decision marked *not yet built* and ledgers the build as its own cycle, pending Eric's scope call |

## Implementer defaults taken

**C2** and **D2** were answered with questions rather than rulings; both were investigated, answered
above, and the Recommended line taken. Neither retires a design law nor changes shipped behaviour.

## What B1 costs, recorded honestly

Retiring the phosphor-green reservation means three of twenty captain hues (`green` 149.8°,
`spring` 164.3°, `jade` 171.6°) sit inside the band DESIGN.md previously kept clear so a player hue
could not be mistaken for a radar return, and `orchid` 270.9° sits in the old storm-violet reserve.
That was a deliberate legibility law with a stated rationale, and it is being retired by preference
to keep the palette expandable — not because the concern was found to be wrong. Ledgered so a
future "why do captains read as blips?" question finds its answer here rather than being
re-litigated from scratch.
