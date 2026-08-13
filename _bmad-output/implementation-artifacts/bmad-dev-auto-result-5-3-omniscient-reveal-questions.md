---
status: blocked
---

# BMad Dev Auto Result — Story 5.3 Omniscient Reveal & Results: QUESTION GATE

Status: blocked (pre-implementation question gate; Eric rulings required before a spec exists)
Blocking condition: six design rulings — a **direct contradiction** between the story's ACs and two
ratified epic-2 amendments that the shipped code implements (the modal's actions and what ESC does),
whether the reveal is a separate beat at all, how the camera reaches a framing its own ratified clamp
forbids, the AC's own named TBD (the reveal-zoom motion exemption, UX open question #25), a 10-second
room-disposal ceiling that the reveal + results must fit inside, and the scope of the modal's new
content.

## Intent (invocation, 2026-08-13)

> `/bmad-dev-auto 5-3. not sure what this is for tbh. surface any questions before implementation.
> use /orchestrate to select models for subagents based on task complexity.`

**"Not sure what this is for" — the short answer.** Story 5.3 is the *back half* of the death beat
Story 5.2 built the front half of. 5.2 gave you five seconds of going down shooting. 5.3 is what
happens after you're on the bottom: the fog lifts off the whole ocean, the camera pulls back until
the entire map is in frame, every ship still afloat wears its name, and you finally see where
everyone actually was — then one modal tells you how you did and one press puts you back at port.
Its pitch is Pillar 2, *"death is cheap"*: losing converts into learning, and the next match is two
presses away.

This worktree is branched from `origin/main` at `117c930` (cycle 78, 0.17.78). **No code, CONFIG,
wire or test change has been made.** Everything below is investigation.

Four investigation subagents were dispatched, model-routed per `/orchestrate` — **Fable** for the
one whole-system seam (the client death→spectate→results→home flow end to end), **Opus** for the
three local seams (the server results/wire path, the ratified design contract, the ledger sweep).
Every load-bearing claim below was then re-verified by hand against the source.

---

## Headline: unlike 5.1 and 5.2, this story arrives with a RATIFIED MOCKUP — and a live contradiction

Two things make 5.3 different from the two cycles before it.

**The good one.** There is a ratified visual contract, drawn at true 1920×1080, with three labelled
frames: `_bmad-output/planning-artifacts/ux-designs/.../mockups/death-reveal-results-1.html`. F1 is
the sinking window (already shipped by 5.2 — epic-5 amendment 21 cites this exact frame). **F2 is the
omniscient reveal and F3 is the results modal, and between them they specify almost everything**:
copy strings, tokens, type sizes, what survives on the HUD, what the hulls and nameplates look like,
even the sequence contract (`mockups/...:1123-1129`): *"F1 → F2 is automatic (~5 s ritardando ends,
fog drops, camera zooms out); F2 → F3 is Enter/click; F3 → port is Enter/ESC… Total cost of death:
two presses, zero menus."* Most of what follows is not "what should this look like" — that is drawn —
but "these three ratified statements disagree with each other."

**The bad one.** The story's ACs were written 2026-07-16. **Eric ruled the opposite on 2026-07-26**,
and the shipped code implements *his later ruling*, not the AC.

## The contradiction that reframes the whole story

| source | date | says |
|---|---|---|
| Story 5.3 AC / UX-DR27 (`epics.md:1039`) | 2026-07-16 | *"the single amber RETURN TO PORT action (Enter or ESC) — no re-queue here, **no dead spectate button**"* |
| EXPERIENCE.md:44 | 2026-07-16 | *"Spectate is a planned future addition — **deliberately absent in v1**, no dead button"* |
| **epic-2 amendment 22** | **2026-07-26** | *"**Elimination flow re-ruled; ESC never returns to port**… being eliminated **immediately opens the results modal** with SPECTATE… and RETURN TO PORT buttons"* |
| **epic-2 amendment 23** | **2026-07-26** | *"ESC is strictly topmost-close… **Closing the elimination modal via ESC = pressing SPECTATE**"* |

The shipped code says so in its own comments. `client/src/main.ts:806-811`: *"ESC — THE uniform
topmost-close law (amendment 23)… **ESC never returns to port**."* `client/src/ui/results.ts:203`:
*"ESC on the modal = SPECTATE (amendment 23)."* `main.ts:850-856`: Enter returns to port **only**
when `matchOver` — on a mid-match elimination Enter does nothing at all.

Per the amendments protocol an amendment beats planning-artifact content, so **amendments 22/23
currently win and the AC loses.** But the AC is what this story was chartered to build, so this is
not a thing an implementer may quietly resolve. It is Q1.

One part of the AC *is* discharged, and cleanly: *"no dead spectate button"* was written when spectate
did not exist. It exists now and the button works. The concern was a placeholder; there is no
placeholder.

---

## Q1 (BLOCKING — the contradiction above) — What are the modal's actions, and what does ESC do?

**Option A — amendments 22/23 stand; the AC is superseded (RECOMMENDED).** The elimination modal
keeps SPECTATE + RETURN TO PORT; ESC closes to spectate; Enter returns to port at game end only.
5.3 changes the modal's *contents and styling*, not its verbs.

**Option B — the AC is restored; amendments 22/23 are retired for the results modal.** One action.
Enter **and** ESC both fire RETURN TO PORT. Spectate is reached some other way (or not at all).

**Option C — split by phase.** Mid-match elimination keeps SPECTATE (there is still a match to
watch); at game end there is nothing to spectate, so the modal drops to one action and ESC returns
to port there.

**Why I lean A.** Amendment 22's reasoning was that *silently* auto-spectating a dead player was the
defect, and an explicit button fixed it — that reasoning is untouched by anything in 5.3. Option B
would delete a working, deliberately-added affordance to satisfy a sentence written before it
existed. But **C is the reading that honours both**, because the AC's real content is *"at the end of
the match, one press, no menus"*, and at game end SPECTATE is already dropped
(`results.ts` renders it only when `canSpectate`, and `main.ts` passes `false` at game end) — so C is
nearly shipped already and only moves ESC.

**The one thing to know either way:** there is an open ledger entry against the game-end modal today
(`deferred-work.md:214-215`) — ESC-closing it leaves the player *"on the dead ocean with settings→
ABANDON as the only exit and the placement table gone for good."* Under C that entry closes for free,
because ESC would leave to port instead of stranding you. That is the strongest argument for C.

---

## Q2 (BLOCKING) — Is the omniscient reveal a separate beat you press through, or just the backdrop?

The mockup's F2 is a full stage: fog gone, whole map framed, `SUNK — 9TH OF 14` in amber center-top,
`ENTER · RESULTS` beneath it, and **nothing else on screen but the chrome bar and kill feed**. The
results modal only appears after you press.

Amendment 22 says elimination *"immediately opens the results modal"*, and that is what ships
(`main.ts:1264` opens the modal on the founder tick). **So the reveal currently has no screen time at
all** — it exists behind the modal from the first frame.

**Option A — build the beat (mockup F2 verbatim; RECOMMENDED).** Founder → reveal, held indefinitely
→ Enter/click → results. This is what the mockup, UX-DR38, and EXPERIENCE.md:106 all describe, and
it is the only option where the story's whole pitch (*"OH. That's where everyone WAS"*) gets a
moment to land.
**Option B — no beat.** Keep the modal at founder; 5.3 delivers the reveal only as what you see when
you close it. Cheapest, and it keeps amendment 22 byte-identical.
**Option C — beat with an auto-advance** after N seconds if you don't press. The mockup explicitly
parks this as unspecced (`mockups/...:950-952`).

**Why A.** B ships the reveal where nobody looks at it. The whole feature is a *view*, and putting a
modal over it on frame one is the same class of mistake as amendment 20's truncated sinking window —
a beat that exists in the code and never in the player's experience. Note A does **not** fight
amendment 22: that amendment's target was the *silent* auto-spectate, and A is not silent — it is a
titled screen with a printed prompt.

**A's cost, named:** it adds one more press to the death flow (founder → Enter → results → Enter →
port = **three**, where the mockup's own footnote advertises *"two presses"*). If Eric wants the
advertised two, the resolution is C with a short auto-advance, or B.

---

## Q3 (BLOCKING) — The camera cannot legally reach the framing the reveal is defined by

This is a hard number, not a preference. `baseZoom = shortAxis / (2 × radarRange)`
(`camera.ts:163-166`) fits **1320u** across the screen. The map is **4800u** across
(`constants.ts:26`, radius 2400). Framing the whole ocean therefore needs a zoom factor of
1320/4800 ≈ **0.275×**. The spectate clamp is `SPECTATE_ZOOM_MIN = 0.5` (`camera.ts:34`) — **ratified
by epic-2 amendment 8** (*"spectate zoom stays as-is (0.5×–1.0×, wheel only)"*) and pinned by two
tests (`spectate.test.ts`, `camera.test.ts`: *"the spectate clamp stays [0.5, 1]"*). At the floor you
see 2640u — **55% of the map.** The reveal's defining framing is currently forbidden.

Also: there is **no zoom animation primitive at all.** The only animated camera property is the
center (`camera.ts:211-217`); every zoom in the game is instantaneous.

**Option A — a distinct REVEAL framing mode (RECOMMENDED).** The reveal computes its own fit-the-map
factor and is exempt from the spectate clamp; the clamp still governs the *manual* wheel zoom after
you press through to spectate. Amendment 8 governed a player-driven wheel, which this is not.
**Option B — lower `SPECTATE_ZOOM_MIN` to ~0.27** so the reveal is just "zoomed all the way out".
Simpler, one constant, but it hands every spectator a permanent whole-map view — which is a
different feature than a reveal, and it retires amendment 8's number.
**Option C — reveal at 0.5×** and accept that "the whole map" means "just over half of it."

**Why A.** It is the only one that leaves amendment 8 meaning what it says while giving the reveal
the framing its own mockup is drawn at. B is defensible but silently changes spectating.

**A perf worry I chased down and can retire:** zooming to 0.275× triples the radar heat buffer's
area, and `radarViewport.test.ts` already watches that budget. **It does not apply here** — in
spectate the client calls `radar.render(null, ...)` (`main.ts:3166`), and a null pose makes
`paintHeat` hide the buffer outright (`radar.ts:1438-1440`). No radar surface is sized during the
reveal. What *does* want a measurement is the map chart: island coastlines and contour bands across
the full disc at once, which nothing has ever drawn before. I'd budget a check, not a redesign.

---

## Q4 (BLOCKING — the AC's own named TBD) — Is the reveal zoom exempt from the motion setting?

This is UX open question #25, quoted verbatim (`EXPERIENCE.md:279`): *"**Reveal-zoom motion
exemption** — whether the death-reveal camera zoom is exempt from the motion/shake setting (it's the
climax beat)."*

The facts that decide it:

- The setting is `motion: 'full' | 'reduced' | 'off'`, and its whole mechanism is one multiplier —
  `motionIntensity()` → `{full: 1, reduced: 0.5, off: 0}` (`settings/store.ts:97-101`). Renderers
  multiply their amplitude by it; **nothing branches on the tier.**
- **Nothing in the game is currently exempt from it.** I checked all ~25 consumers. The two things
  that *are* exempt from something are exempt from the *flash budget* and from *attention tiering*,
  not from `motion`. An exemption here would be **the first of its kind in the codebase.**
- The standing law is written into the setting's own docstring (`store.ts:17-18`): *"`off` removes
  motion, **never information**."*
- `camera.ts` and `spectate.ts` contain **zero** references to `motion` today.

**Option A — NOT exempt (RECOMMENDED).** Scale the zoom animation by `motionIntensity`, and at
`off` **snap** straight to the whole-map framing instead of animating to it. You still get the
reveal — all the information, none of the movement — which is exactly what the standing law
prescribes, and it needs no new exemption class.
**Option B — exempt.** The zoom always animates at full duration regardless of the setting, on the
grounds that it is the climax beat. Costs the first motion exemption in the game, and the precedent
that "important enough" can override an accessibility setting.

**Why A, strongly.** B's premise — that exempting it is how you keep the climax — is false under A:
at `motion: off` you still arrive at the identical whole-map view, on the same frame the animation
would have started. Nothing about the reveal is lost; only the travel is. There is no version of
this where an accessibility setting costs a player the content.

**And a process note that binds how this gets asked** (`deferred-work.md:860`, a standing team
agreement): *"prefer 'ship it behind a flag and look' over 'choose from four written descriptions'
for any question about a visual"* — and it names this exact gate as one of Epic 5's three. So the
honest recommendation is: **build A, and look at it.** If the snap reads badly at `off`, that is a
finding, and the finding is what should reopen B — not a paragraph.

---

## Q5 (BLOCKING — a ceiling nothing in the AC mentions) — Ten seconds is not enough

`CONFIG.match.resultsSeconds = 10` (`constants.ts:930`). Ten seconds after `finish()`, the room
**disconnects every client** (`match.ts:605`), and the client's leave handler force-reloads to the
menu (`main.ts:1432`).

At game end that ten seconds must now contain: the last sinking captain's window closing (amendment
20 holds the finish open for it), the reveal beat, and the player reading a modal that 5.3 is about
to add **a boons list and a four-card last-offer review** to. It does not fit. Today it barely
matters because the modal opens instantly and carries five short lines.

**Option A — raise `resultsSeconds` (RECOMMENDED), to 30 or 45.** One gameplay-authoritative CONFIG
value; it is Eric's to set. 45s makes the whole beat comfortable and still disposes the room.
**Option B — leave it at 10** and design the reveal to be skippable-fast at game end.
**Option C — start the clock at the results broadcast rather than at `finish()`** so the reveal beat
doesn't spend it. Costs a server change to a timer that currently has one meaning.

I'd take A with 45s and no ceremony. It costs nothing, and the number was set long before there was
anything to read on that screen.

---

## Q6 — The modal's new content: how far does "reviewable" go?

The AC wants **kills, placement, time afloat, accrued boons + last offer**. Shipped today
(`results.ts:80-97`): a `BOONS FITTED` count, a `KILLS` count, placement as prose in the headline,
and a `SHIPS YOU SANK` roll. So: **kills ✅, placement ✅, time afloat ❌, boons-as-a-list ❌,
last offer ❌.**

**The good news is that all three gaps cost ZERO wire and no PV bump**, which I did not expect:

- **Boons and last offer are already on the client.** `net.you` is deliberately **never cleared** on
  death (`roomBindings.ts:799-800`: *"the wreck's last pose survives the entire spectate period"*),
  so `you.boons` and `you.offer` — the exact ids the refit menu resolves against `BOON_CATALOG` —
  are still in hand when the modal opens. Nothing needs to be sent.
- **Time afloat is derivable client-side** for the local player (the match anchor `zoneStartT` is
  public schema; the founder moment is already latched by 5.2's `tickSinkingWindow`).

**The question is only about the placement TABLE, at game end.** `ResultsRow` is
`{id, name, placement, kills, damageDealt}` (`types.ts:1060-1066`).

**Option A — own-player only (RECOMMENDED).** Time afloat, boons and last offer appear in *your*
stat block; the table stays as it is. **PROTOCOL_VERSION stays 34.** Zero wire, zero server change.
**Option B — put `afloatMs` on `ResultsRow` too** so the table shows every captain's time afloat.
The data exists server-side (`Match.activatedAt` public, `sinkTimes` private, and `match.ts:715-716`
already computes a match duration for telemetry), so it is a small change — but it is a **wire
change, PV 34 → 35**, and it retires the committed `goldenFrames` snapshot.

**Why A.** The mockup's F3 draws exactly three stat tiles — `KILLS / PLACEMENT / TIME AFLOAT` — and
they are *yours*. Nothing in the mockup or in UX-DR27 asks for another player's time. **And other
players' boons are not merely absent, they are forbidden**: boons and offers are ratified
SELF-PRIVATE (`types.ts:270-280`, `frames.ts:80-83`), so a "review everyone's build" reading would be
a new disclosure class, not a formatting change. A is the only reading consistent with that.

---

## Q7 (SMALL, but they are copy rulings and copy is yours) — Three strings

1. **The banner.** Mockup F3 says `SUNK` with `9TH OF 14` beneath it; the shipped modal says
   `ELIMINATED` and `ELIMINATED — PLACE #3`. EXPERIENCE.md:52 backs the mockup: *"Death register is
   dry-naval: 'SUNK — 9TH OF 14'. Grim facts, no mockery, no exclamation points."* I'd take the
   mockup. It reads better and it is the ratified voice.
2. **The button sub-line.** The mockup prints `SET SAIL IS ONE PRESS AWAY` under RETURN TO PORT. The
   home screen's button today says **`PLAY`**, not SET SAIL (`ui/home.ts:5`). Either the sub-line
   changes or the home button does — right now it would promise a button that isn't there.
3. **The reveal prompt.** `ENTER · RESULTS`, tagged PROPOSAL in the mockup's own legend. Fine as
   drawn unless you want different words.

---

## Rulings I took (derived from the mockup and shipped code, not invented — Eric has veto on every one)

| # | Ruling | Basis |
|---|---|---|
| R1 | **The reveal is CLIENT-ONLY presentation.** No server change, no wire field, no seventh perception exception, `PROTOCOL_VERSION` stays 34 | Spectator frames already carry every hull unfogged (`frames.ts:157-174`, pinned by `spectator.test.ts`); the client already drops the fog at founder (`main.ts:3098`) |
| R2 | **The reveal shows every hull still afloat or sinking — captains and drones — and no wrecks but your own.** No server change needed for this | `signals.ts:432` rejects `sunk` lifecycles *before* the `spectator ⇒ true` clause at `:433`; mockup F2 draws exactly this (living hulls + your own wreck), so shipped behaviour and the ratified drawing already agree |
| R3 | **Your own wreck renders at the reveal, with its callsign plate.** Reverses two lines of spectate teardown | Mockup F2 draws the wreck at .45 opacity in your hue with `TIN SPARROW` at weight 600 (`mockups/...:885-897`); today `main.ts:3100-3101` hides both the own hull and its plate. `net.you` retains the last pose |
| R4 | **Nameplates need no new machinery.** Every hull in the contact store already gets a plate, already in the hue's text-safe variant, already literally `DRONE` in drone grey | `render/nameplates.ts:50-67`, `render/contacts.ts:237-244` — UX-DR22's grammar is already implemented; spectate simply delivers more contacts |
| R5 | **The fog drop stays `setVisible(false)` (instant), never a fade** | `plateRoot` sits BELOW `fogSprite` while hulls sit above it in `chartRoot` (`stage.ts:33-34, 232`, epic-5 amendment 22) — a fade would dim every nameplate while the hulls stayed bright |
| R6 | **`SHIPS YOU SANK` stays**, though mockup F3 omits it | Amendment 23 ratified it by name (*"a list of all of the contestant-controlled ships you personally sunk"*); the mockup predates that ruling |
| R7 | **The modal's restyle follows mockup F3 exactly** — 620px, `rounded.lg` 12px, hairline border (not the shipped phosphor one), the `rgba(2,6,4,.62)` dim so the reveal shows through (not today's near-opaque `.88` black), and the amber Primary Button as an outline+glow with the `⏎` chip — never the shipped filled slab | Mockup `:332-410`; DESIGN.md:243/245/217. Fourteen concrete divergences catalogued, all presentational |
| R8 | **The reveal is keyed on YOUR founder, never on "spectating began"** | The winner also receives `spec: true` frames at finish (`frames.ts:139`) — a reveal keyed on the spectate latch would fire for the player who won |
| R9 | **The reveal owns its own key surface**, registered with `escapeAction`/`openSurfaces` | ESC's topmost-close law would otherwise misroute (`main.ts:801-826`), and `presentResults` calls `clearKeys()` + a 400ms arming grace that the reveal must not inherit |

---

## The traps I'd flag to whoever implements this

1. **`alive: you?.alive ?? true`** (`main.ts:590`) — a missing `you` reads as ALIVE. This was 5.2's
   named trap and it is still there.
2. **`net.you` is never cleared, and that is now load-bearing** — it is the *only* reason the modal
   can show your boons and last offer. But every predicate reading it must still take `spectating`,
   which is the exact stale-window bug 5.2's review caught.
3. **`Effects.setSpectating` wipes the wake store on a regime crossing** (`main.ts:3312-3317`) — a
   reveal that flips visibility regimes mid-animation clears every ribbon on the water.
4. **Contacts arrive one tick late and fade in through a Fader** — a zoom-out that starts on the
   founder frame pans across empty water for a beat before the hulls populate.
5. **A hull whose roster name or hue hasn't synced gets NO plate, ever** (`nameplates.ts:62-76`, by
   design, to avoid leaking session ids). *"Every revealed ship wears its nameplate"* is conditional
   on roster sync, and the latch means a plate resolved once persists after that player leaves.
6. **`goldenFrames.test.ts` + its committed snapshot** is the repo's one byte-identity gate on frame
   shape. Under Q6 option A it never moves; under B it must be retired deliberately.
7. **This worktree has no `node_modules`** — 15 test files (including `results.test.ts`, the single
   most load-bearing file for this story) cannot even collect. `npm install` before trusting green.
8. **`matchSmoke` is known-flaky on current balance** (`deferred-work.md:903`) — treat a single
   failure as inconclusive, not as a regression signal.
9. **CLAUDE.md's `3836` test count is stale by two cycles** — cycle 77 measured 4189. Worth fixing
   in the landing PR.

## Ledger items 5.3 can close, or should decline in writing

- `deferred-work.md:214-215` — the game-end modal has no reopen path after ESC. **Q1 option C closes
  it for free.**
- `deferred-work.md:189-190` — RETURN TO PORT gives zero activation feedback and stays unlabeled for
  up to ~35s once a real ad adapter lands. Flagged as *"DESIGN.md surface and therefore Eric's call"*;
  5.3 is the story that owns the button.
- `deferred-work.md:211-212` — `SHIPS YOU SANK` is best-effort: a kill with no line of sight yields
  no *name*. Needs a self-private wire addition and a PV bump if you want it fixed; out of scope
  unless Eric says otherwise.
- `deferred-work.md:894-895` — the one open Eric ruling 5.2 handed forward: wounded smoke stops at
  sink-entry, which is a sinking tell by omission. Unrelated to the reveal; still yours to rule.
- `deferred-work.md:890-891` — the provisional-vs-final placement mismatch. **Already closed** by
  epic-5 amendment 9; noted here only so nobody re-opens it.

## Scale estimate (for sizing, not a commitment)

Client-only under R1: a new reveal UX state and its key surface; a camera fit-map framing + the
game's first zoom animation; un-hiding the own wreck and its plate; the modal's content additions
(time afloat, boons list, offer cards) and its restyle to mockup F3; plus new coverage for three
things nothing pins today (*fog drops on death*, *the camera frames the whole map*, *nameplates on
all hulls*) and the deliberate retirement of the spectate-clamp tests if Q3 goes to B. Server: nothing
under Q6-A, one CONFIG number under Q5-A. **Comparable to Story 3.3 (the chrome bar) — presentation-
heavy, wire-light** — and markedly smaller than 5.2, unless Q6 goes to B.

## What happens next

Answer Q1-Q7 (a sentence each is plenty) and re-run `/bmad-dev-auto 5-3`. The answers become epic-5
amendments 23+, the spec gets written against them, and implementation follows. Veto any of R1-R9 in
the same breath if they're wrong.

**If you only answer one, make it Q1** — it is a direct conflict between this story's charter and
your own later ruling, and every other question is downstream of which one governs.
