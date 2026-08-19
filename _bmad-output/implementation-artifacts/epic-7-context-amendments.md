# Epic 7 Context — Ratified Amendments (durable — survives recompiles)

Append-only. `epic-7-context.md` is REGENERABLE and anything recorded only there will be
erased; this file is the durable home for every ratified correction, Eric ruling, adjudicated
contradiction and review patch touching Epic 7.

Each entry states its **attribution** explicitly — measured fact, implementer decision, or
Eric ruling — because Epic 6's ledger showed how quickly an orchestrator's chosen number gets
re-read as an owner's ruling. Nothing below is an Eric ruling unless it says so.

---

## Amendment 1 — The reference device is stamped (MEASURED FACT, cycle 103, 2026-08-18)

NFR1 as amended names "Eric's Intel i7 MacBook" and the ledger carried an open item asking
for the exact model/year "so the bar is reproducible by someone other than Eric". Read off
the machine rather than typed in:

**MacBook Pro 16,1 (2019) · Intel Core i7-9750H @ 2.60 GHz, 12 logical cores · 32 GB ·
AMD Radeon Pro 5300M (discrete) + Intel UHD 630 (integrated), switchable · Darwin 25.4.0 ·
Retina panel, client renders at `devicePixelRatio` 2 (a 3200x1800 backing store).**

READ OFF THE MACHINE AT RUN TIME, not typed in — `perfLib.mjs` reads `os.cpus()`,
`os.totalmem()` and `sysctl hw.model`. The first draft was a hardcoded literal under a
docstring claiming it was measured, which would have stamped this machine's identity onto
any other person's run — the exact failure the docstring said it existed to prevent. The
record also carries `isRatifiedReferenceDevice`, so a run on other hardware is still a
measurement but is never mistaken for THE bar.

**The switchable GPU pair is part of the stamp, not a footnote** — amendment 3 is entirely
about which half of it draws the frame. Any future NFR1 run that does not name the adapter is
not a verdict. That ledger item is CLOSED.

---

## Amendment 2 — The perf build: how NFR1 became measurable at all (IMPLEMENTER DECISION)

The NFR1 verdict was not unobtained through neglect; it was **unobtainable by construction**,
and the deadlock is worth stating because anyone who removes either half re-creates it:

- the only split sim/render instrument (`client/src/stage/worstCase.ts`, Story 4.8) is
  reachable only under `import.meta.env.DEV`; and
- Eric ruled (2026-08-11) that a Vite **dev** build is an invalid basis for an NFR1 verdict in
  either direction, and that headless Chromium's throttled `requestAnimationFrame` makes any
  browser frame *count* a measurement of the throttle rather than the game.

So "has an instrument" and "is a valid basis" were mutually exclusive. The resolution is
`vite build --mode perf` (`__HC_PERF__`): the identical Rollup pipeline, identical
minification, identical folded-away dev branches, written to a separate `client/dist-perf`.
**It is NOT "one define different" and this file will not say so** — the phrase appeared five
times in the first draft and the bytes contradict it: the perf build carries the define AND an
additional `worstCase` chunk that is fetched and executed on the measured page. That chunk IS
the instrument. What legitimises the verdict is that everything else — bundling, minification,
dead-branch folding — is the production path, not that the two builds are identical. **The shipped `client/dist` is unchanged and
provably so** — Story 4.8's existing `--verify-bundle` greps the built assets for
`HC_STAGED_WORSTCASE_4_8`, `__hcStage`, `worstcase` and `worstCase`, and still passes.

**The perf build is never the deployed artifact.** NFR17 is intact: both gate terms
(`import.meta.env.DEV || __HC_PERF__`) fold to `false` in the default build, so the branch is
dead code and the scene is not emitted.

The second half of the resolution is the **headful** basis on the reference device, which is
what makes a cadence number an observation rather than an artifact of the throttle.

---

## Amendment 3 — `powerPreference` was unset, and it was worth ~40 FPS (MEASURED DEFECT + FIX)

Pixi defaults a WebGL context to `powerPreference: 'default'` (`GlContextSystem`), and
`render/stage.ts`'s `app.init()` never overrode it. On a machine with switchable graphics the
browser is then free to park the game on the **low-power** adapter — and on the reference
MacBook it did. Home screen, shipped build, 1600×900 at dpr 2, same bytes, same pixels, only
the adapter differing:

| adapter | frame interval p50 | implied |
|---|---|---|
| Intel UHD 630 (integrated) | **64.9 ms** | ~15 FPS |
| AMD Radeon Pro 5300M (discrete) | **16.7 ms** | ~60 FPS |

Fixed by setting `powerPreference: 'high-performance'`, verified end to end: with **no** GPU
flag forced the shipped build now lands on the discrete adapter and holds 16.7 ms p50 /
18.5 ms p95, and every NFR1 figure in amendment 4 was taken unforced. (The pre-fix
observation was 50.8 ms; the 64.9 ms above is the post-fix controlled re-measurement forcing
the integrated adapter, which is the honest comparison now that the default no longer lands
there.)

**It is a hint, not a guarantee, and nothing may depend on it** — a machine with no discrete
GPU keeps the one it has, which is exactly the case amendment 4 is about. The cost is battery
on dual-GPU laptops, the correct trade for a real-time game.

**The trap for the next agent:** a diagnostic WebGL context created with the *default* power
preference can report a different adapter than the game's own context **on the same page**.
That is not a contradiction, it is the mechanism — `powerPreference` decides per context. A
probe that does not mirror the game's request will attach an honest-looking number to the
wrong hardware. Both capture scripts now request `high-performance` in their probes for this
reason.

---

## Amendment 4 — NFR1 PASSES in live play; the omniscient reveal BREACHES the render leg

**The verdict, taken on the perf build, headful, dpr 2, GPU unforced, in the fully populated
reference scenario (20 contestants + the 48-hull peak PvE fleet + ordnance + all shipped
effects = 68 hulls), against 16.6 ms = sim <= 3 + render <= 10 + headroom >= 3.6:**

| framing | frame p95 | sim | render (scene-graph + draw) | headroom | dropped | verdict |
|---|---|---|---|---|---|---|
| alive 0.5x | 6.6 ms | 0.1 ms | **6.5** (3.9 + 2.8) | 10.0 ms | 0 / 720 | PASS |
| alive 1.0x | 5.7 ms | 0.1 ms | **5.7** (2.9 + 3.0) | 10.9 ms | 0 / 720 | PASS |
| alive 1.5x | 5.6 ms | 0.1 ms | **5.6** (2.9 + 3.1) | 11.0 ms | 0 / 720 | PASS |
| omniscient reveal | 11.8 ms | 0.1 ms | **11.8** (9.1 + 2.9) | 4.8 ms | 0 / 720 | **FAIL — render** |

**Live play passes every leg at every zoom**, with a measured 60 FPS and ZERO dropped frames.
Simulation runs at ~3% of its allowance, so the sim half of the budget is not a live concern.

**THE REVEAL BREACHES THE RENDER LEG — 11.8 ms against 10 ms.** Two qualifications, neither
of which excuses it: the FRAME still holds (11.8 ms inside 16.6, headroom 4.8 ms, zero
dropped frames — what is breached is the ratified ALLOCATION, not 60 FPS); and it is the
FRAMING, not the roster — re-run at the same framing with the 20-hull readability population
it still costs 11.3 ms against 11.8, so whole-disc drawing is the cost and the number is nearly
independent of how many ships are afloat.

**NO ATTRIBUTION IS CLAIMED.** The cost is CPU-side scene-graph (9.1 of the 11.8 ms) and the
map layer is already cached — `MapChart.update` re-strokes only on a meaningful zoom change,
so it is NOT a per-frame terrain redraw. Naming the responsible system needs per-subsystem
timing, which exists nowhere in the client. Ledgered rather than guessed, and the guess most
likely to be wrong is the tempting one (wakes), which the 20-hull control already argues
against.

**OPEN, NEEDS ERIC — the integrated-hardware case.** Forced onto the UHD 630 the same build
fails everywhere: alive framings 16-20 ms/frame at cadence p50 66.9-83.4 ms (~12-15 FPS), the
reveal at 29.4 ms with headroom -12.8 ms. This is neither a regression nor a failure of
amendment 3's fix — it is what a player gets whose machine has NO discrete GPU to ask for,
and a large share of laptops are exactly that. NFR1 as amended pins the bar to the reference
MacBook and explicitly retired the low-end device, so this sits OUTSIDE the ratified bar. The
beta-scope question Eric owns: does integrated-only hardware get a supported path (a
resolution cap, a reduced-effects mode, a stated hardware floor) or is it out of scope?
Evidence: `perf-gate/nfr1-frame-budget-gpu-low.json`.

## Amendment 5 — The risk was FILL RATE, not entity growth (MEASURED, reframes three retros)

Three consecutive retrospectives, and the story brief itself, framed the NFR1 risk as three
epics of unmeasured **entity** growth (return heatmap, radar shadows, wakes, chop, a 2800 u
ocean, up to 63 fleet hulls, 20-hull bot lobbies, the reveal chart). **That is not where the
risk was, and the correction is load-bearing for how the next perf cycle is scoped.**

1. **Population does not move the frame.** At dpr 2 on the integrated GPU the NFR1 population
   (68 hulls, 704 scene nodes) and the readability population (20 hulls, 582 nodes) cost the
   *same*: 67.2 ms vs 66.7 ms.
2. **Pixels do.** Same scene: dpr 1 (1.44 M px) 16.7 ms; dpr 2 (5.76 M px) 67 ms; half
   viewport at dpr 2 (2.88 M px) 49.3 ms.
3. **The staged scene is not the cause.** The **home screen** of the shipped build — no match,
   no harness, just the ambient scene — showed the identical 50.8 ms at dpr 2. Baseline
   per-pixel composite, not anything the battle adds.

Throughout, the CPU was idle: ~7 ms of callback work inside a 67 ms frame. **A cost-only
benchmark cannot see any of this** — which is the standing argument for keeping the headful
basis rather than reverting to targeted benchmarks. It also means pooling, batching and decay
caps are the wrong lever for the integrated case; overdraw and resolution are the right ones.

---

## Amendment 6 — The cadence flag must key off the FLOOR, never the median (IMPLEMENTER, fail-open defect)

`PresentStats.vsyncTrusted` exists so a frame-rate number declares when it is a lie. Its first
draft tested the **median** interval against a plausible-display band, which conflates two
completely different facts: *"there is no real vsync source here"* and *"there is one, and the
game is missing half its deadlines."* A run genuinely presenting at 30 FPS has a median of
~33 ms and was therefore reported as **untrustworthy** — so the instrument answered a measured
30 FPS with a refusal, which reads in the audit record exactly like a clean run. **It failed
open, in the one direction that matters**, and it did so on real data during this cycle before
being caught.

It now keys off the **5th-percentile** interval — the cadence floor, i.e. what the display is
*capable* of — leaving the median free to report the bad news. Nearest-rank rather than the
outright minimum, so one coalesced present cannot vouch for a throttled source. Both cases are
pinned by tests. A refusal now also records what it observed, because discarding the samples
made a refused run indistinguishable from a clean one.

`FrameStats` still carries **no `fps` field** (2026-08-11 ruling), now enforced at the type
level so it stops compiling if anyone adds one.

---

## Amendment 7 — NFR2 passes at about a third of budget; the font fix claims no improvement (MEASURED)

Against the **shipped** `client/dist`, cold cache every run, interactive defined as
`#main-menu button` present: **3 076 ms** to interactive home on a throttled residential
profile (24 Mbps / 30 ms RTT) against the ~10 s budget, FCP 1 264 ms. Bundle **982 kB on disk,
309 kB gzipped**, across 9 JS files — a 737 kB main chunk plus eight Pixi sub-chunks. (An
earlier draft called it "one chunk"; that was the main chunk mistaken for the whole build.)

**"Fonts do not block first paint" is demonstrated by experiment, not inferred from
timings**: a profile that *blocks* `fonts.googleapis.com` and `fonts.gstatic.com` outright
reaches first paint at 836 ms and interactive home at 2 688 ms — unchanged, indeed slightly
faster than the unblocked run. Supported by two
changes: the font stylesheet loads via `rel="preload" … onload="this.rel='stylesheet'"`, and
`createStage()` races the font wait against `CLIENT_CONFIG.boot.fontWaitMs` (1500 ms) so
`app.init()` cannot be held hostage by a third-party CDN.

**Recorded honestly: that fix did not move the measured number.** Run-to-run variance on the
same build spans 2.3-3.1 s, which is larger than any change it made. The font CDN was never the
bottleneck at this connection speed. The change is still correct, and it is what makes the
blocked profile pass, but **no improvement is claimed from it.**

**Ad, analytics and consent script cost is NOT measured** — none of it exists yet (Stories
7.2 / 7.4). What this establishes is the headroom they must fit inside: **~7.7 s** on the
throttled profile. Both stories must re-measure with `loadCapture.mjs` when they land.

---

## Amendment 8 — Story 4.8's readability gate is untouched (IMPLEMENTER, scope discipline)

`SCENE` and every pre-existing export of `worstCaseScene.ts` are byte-identical in value, and
`/?stage=worstcase` with no `profile` parameter stages exactly the scene Story 4.8 ratified.
NFR1's population is a **second profile**, not an edit: `SCENE`'s counts are reasoned against
the *attention* ceiling (~100× the ratified onset budget inside one screen region) and are
load-bearing for a ratified gate, while NFR1's ceiling is total entity population across the
viewport. Editing `SCENE` would have silently re-taken a ratified decision.

Two modelling choices inside the NFR1 profile, disclosed rather than buried because both shape
the number:

- **Far hulls paint on a derived sweep stride**, not every tick. Painting all 50 every tick is
  ~80× what a 15 rpm sweep can structurally produce, against a 12 s phosphor hold — it would
  have manufactured a breach no player could ever provoke, which is the failure mode `SCENE`'s
  own comment warns about ("a lie in the pessimistic direction").
- **Near/far is a predicate, not a slot count.** A count would have put all 48 fleet hulls in
  the annulus (they are the tail of the slot range), measuring the cheap half of the picture
  as if it were the whole one. Every 4th slot is near — the (sight/radar)² = ¼ area ratio.

---

## Amendment 9 — Test-count corrections of record (MEASURED)

`npm run check` is green at **5 127 tests** — shared 746, server 1 505, client 2 876 (exit 0).
Two figures in circulation are wrong and should not be propagated: **CLAUDE.md's "4309" is
stale** (corrected in this cycle), and the **"7 980" reported mid-cycle by an implementation
subagent is simply incorrect** — it was never true of any workspace split. Verified by
stripping ANSI from the run log rather than by reading a summary line.

---

## Amendment 10 — THE FRAME DOES NOT END WHERE OUR CODE ENDS (review catch, cycle 103)

The first draft of this cycle's instrument timed the wrong thing, and it is the single most
important trap in this whole area.

`app/loop.ts:14-16` has recorded since cycle 91 that the client's ticker listener runs at the
default `UPDATE_PRIORITY.NORMAL` **while Pixi's own renderer sits at LOW** — a separate
callback, afterwards. So timing our own callbacks measures the SCENE-GRAPH UPDATE and excludes
every batch, draw call, filter, mask and full-screen composite: most of the frame, and exactly
the fill-rate work amendment 5 concludes dominates.

**The evidence of the flaw was sitting in the draft's own output.** An integrated-GPU run
reported a three-leg **PASS** — render 6.9 ms, headroom 9.5 ms — on a machine whose measured
cadence in the same record was 66.9 ms per frame with 156 dropped frames. A budget that passes
at 15 FPS is not measuring the frame.

Fixed structurally: the harness brackets the WHOLE ticker with two callbacks, opening at
`HIGH` and closing at `UTILITY` (below `LOW`), so `total` includes Pixi's draw pass.
`FrameSample` gains `draw`, `FrameStats` gains `renderTotal = render + draw` **summed per
frame and then reduced** — never by adding two percentiles, since `p95(a) + p95(b)` is not
`p95(a+b)` unless the peaks coincide, and here they do not.

**Two rules that follow, and that a future edit must not quietly undo:**
1. **NFR1's render leg is `renderTotal`, never `render`.** The split is kept visible because
   it is diagnostic (the reveal's breach is 9.0 ms scene-graph against 2.9 ms draw), but the
   leg is the sum.
2. **A trustworthy cadence VETOES the budget arithmetic.** Where a real display is observed it
   is ground truth and the budget legs are the explanation; a refused cadence cannot veto,
   because absence of evidence is not evidence.

Neither `render` nor `draw` is GPU execution time — no browser API exposes that. The cadence
is what observes the GPU.

---

## Amendment 11 — The staged reveal must reset the user zoom, or it measures a view nobody sees

The live reveal path (`main.ts`) calls `camera.resetUserZoom()` immediately before
`beginReveal()`, and its own comment calls the ordering deliberate. The staged path did not.

Because the capture runs framings in order with the reveal **last**, the alive 1.5× user zoom
was still composed into `baseZoom × zoomFactor × userZoom` — so the reveal was measured
**1.5× tighter than any player can see**, with the map disc running off all four edges when
the entire point of the framing is that the ocean fits WITH margin. Optimistic in exactly the
direction that mattered, and **order-dependent**: measured alone it framed differently than
measured fourth, inside a script whose own comment lectures the reader that measurement order
is a confound.

Cost of the correction: the reveal went **5.6 ms → 11.8 ms**, which is how amendment 4's
breach surfaced at all. The record now carries `composedZoom` (0.1531) beside `userZoom` so
the framing is visible rather than inferred, and `setZoom()` leaves the reveal framing first
so the two zooms can never compound.

**The general rule:** a staged scene that reproduces a live camera mode must reproduce its
whole entry sequence, not the one call that names the mode.

---

## Amendment 12 — Evidence hygiene: a record must describe itself (review catch)

Three defects in the first draft's audit record, all the same shape — the evidence did not
carry enough about itself to stay true:

- **Fixed output filenames.** Every run wrote `nfr1-frame-budget.json` and fixed-name PNGs, so
  a subset run, a stress run or a different dpr silently replaced the gate evidence with
  something not comparable to it. The cycle ended up hand-renaming files and writing "this one
  is a copy of that one" into the README — a claim that rots on the next run. Output names now
  derive from the configuration, so a run can only overwrite a run of the SAME configuration.
- **A hardcoded basis.** The record stated `profile=nfr1` as a literal while reading the
  profile from the environment, and recorded none of `HC_GPU` / `HC_DPR` / `HC_FRAMINGS`. The
  basis block now carries every knob, and the capture **reads the staged profile back from the
  harness** and refuses to continue if it differs from the one requested — an unknown
  `profile=` value falls back to the readability population by design, and without the
  read-back a typo would file a 20-hull run as the ratified 68-hull verdict.
- **A field that was wrong in every row.** `firstPaintPrecededFonts` was computed from FCP, not
  first paint, and read `false` in all six runs *including the one that aborts every font
  request* — inside a record whose thesis is "demonstrated, not argued". Renamed to
  `fcpPrecededLastFontResponse` and demoted to context; the decisive evidence is the
  fonts-blocked profile landing inside budget.

Also: a refusal now records what it observed (a refused run was previously indistinguishable
from a clean one), a software renderer refuses the verdict instead of passing it, and
`client/scripts/**/*.mjs` is now linted — 400+ lines of script that decides what the perf
evidence says had landed with no static analysis, and shipped a duplicate object key in the
basis block that nothing could have caught.

---

## Amendment 13 — "60 FPS sustains" is a dropped-frame test, not a p95 threshold

The first cadence criterion was a bare `p95 <= 18.0 ms` sitting outside the budget constants.
It failed runs that dropped **zero** frames, because ordinary vsync jitter puts p95 at
18.3-18.6 ms on a perfectly healthy 60 Hz present — so the instrument reported "60 FPS DOES
NOT SUSTAIN" for a display that never missed once.

The criterion now reuses the definition the harness already had: `LONG_PRESENT_MS` (25 ms, one
and a half 60 Hz periods) IS a dropped frame. **60 FPS sustains when the median sits at the
refresh period (<= 18 ms) and dropped frames are <= 0.5% of presents.** Jitter around the
period is not a miss. Both figures live in `CADENCE` beside `BUDGET` rather than inline.

Related, same cycle: `SAMPLE_CAP` rose 600 → 1200 because a 12 s dwell at 60 Hz presents ~720
frames — the ring silently reported the last ~10 s while the record claimed a 12 s window, and
`frames` could never exceed 601.

---

## Amendment 14 — The Story 7-2 question gate: fourteen ERIC RULINGS, 2026-08-18 (cycle 104)

Eric asked for questions before implementation and supplied the live GA4 tag, so the measurement
ID is settled: **`G-LLCR4XRZGG`**, property already created. Everything below is an **ERIC RULING**
taken at the pre-implementation gate (`bmad-dev-auto-result-7-2-analytics-consent-and-privacy-questions.md`).

**THE BLOCKING FINDING THAT FORCED THE GATE.** Story 7.2's AC names *"Google's own free CMP"*
(`epics.md:1252`), but Google's setup article opens with the prerequisite verbatim — *"After you
add your sites to AdSense, complete the following steps to create the European regulations
message"* and *"Make sure you've placed the AdSense code on your site"*
(https://support.google.com/adsense/answer/10960768). **Adding the site to AdSense and placing its
code IS Story 7.4**, while the epic sequences 7.2 first precisely so its privacy policy unblocks
the AdSense application (`sprint-change-proposal-2026-08-18.md:240-245`). **7.2 produces the CMP's
input; 7.4 produces the CMP's prerequisite.** Compounding it, Google's CMP renders **its own
dialog** (https://support.google.com/adsense/answer/16918505), so adopting it *is* shipping the
vendor surface that `epics.md:1255` forbids three lines below the clause requiring it.

It resolved on Eric's own approved document rather than on new judgement: a certified CMP is a
condition on **serving personalized ads**, not on analytics
(https://support.google.com/adsense/answer/13554116), and
`sprint-change-proposal-2026-08-18.md:840` already records that *"Non-personalized ads do not
require a certified CMP — which is what made this a revenue question rather than a legal one."*

### The rulings

- **R1 — OWN-BUILT BANNER NOW; GOOGLE'S CMP ARRIVES WITH THE ADS AT 7.4.** 7.2 ships a
  Hullcracker-register banner driving Consent Mode v2 for **analytics**. Nothing is discarded at
  7.4: the Consent Mode plumbing, the persisted consent record and the privacy policy are all
  required either way. **`epics.md:1252`'s CMP clause is DEFERRED to Story 7.4, not struck** —
  the certified CMP is still required before personalized ads serve in the EEA/UK/CH.
- **R2 — THE BANNER IS A NON-BLOCKING BOTTOM BAR.** Home stays fully usable; the bar persists
  until answered. *The strictness lives in the data, not in the player's way* — which is only
  coherent because of R7. This SOFTENS the change proposal's *"it sits between them and the
  water"* (`:529`) to *"it is the first thing a new player sees"* (`epics.md:1255`), which the bar
  still satisfies.
- **R3 — GA4's PERSISTED `client_id` IS ACCEPTED, UNDER CONSENT.** Named as a values decision, not
  a legal one: `client/src/net/liveness.ts:62-67` says in capital letters that its id is
  *"deliberately NOT persisted — persisting it would make it a device identifier."* **That comment
  stays true of `liveness.ts` and is NOT a project-wide vow**; it gains one clarifying line so a
  future reader does not read the two as contradictory. This is the first identifier this project
  has ever persisted on a player's machine, and the policy names the cookie explicitly.
- **R4 — `match_start` IS ROOM-JOINED-PLUS-WELCOME**, not the countdown ending. For a funnel the
  moment means *the player got into a game*. Consequence accepted: a player who joins and quits
  during the waiting room counts as having started.
- **R5 — `match_end` IS THE PLAYER'S OWN EXIT FROM PLAY** — elimination modal or results,
  whichever comes first, latched once per match. Firing only on the results broadcast would miss
  every player who died and left, which in a 20-hull lobby is most of them.
- **R6 + R7 COLLIDED, AND R7 GOVERNS.** R6 was *"show the bar to everyone; deny by default only in
  the EEA/UK/CH"*; R7 was **Consent Mode BASIC** — no Google tag loads until a player accepts.
  **They cannot both hold, because there is no client-side geo signal**, so the code cannot know
  whether to load the script before the answer arrives. Put back to Eric explicitly, he chose
  **BASIC, GLOBALLY: nothing loads for anyone until Accept.** What survives of R6 is that the bar
  is **shown to everyone** (no geo lookup is added — it would be a new third-party request against
  NFR2) and that region-scoped defaults are still set once the tag loads, for correctness.
  **The accepted cost, stated at the gate and taken knowingly: the funnel measures only players
  who actively click Accept, and will undercount by however many ignore the bar.**
- **R8 — THE POLICY LIVES AT `/privacy`.** *(See the implementer deviation recorded below.)*
- **R9 — THE POLICY COPY IS DRAFTED BY THE IMPLEMENTER FROM THE VERIFIED DATA INVENTORY, AND
  APPROVED BY ERIC**, then frozen in the manner of `client/src/ui/taglines.ts:7-10`.
- **R10 — THE PRIVACY CONTACT IS `contact@hullcracker.io`.** It MUST receive mail before beta; an
  unreachable contact address in a published policy is a defect, not a placeholder.
- **R11 — THE DATA CONTROLLER IS ERIC AS AN INDIVIDUAL OPERATOR, UNITED STATES.** No company
  entity, no state named in the governing-law clause.
- **R12 — STORY 7.2 MINTS THE REUSABLE STANDARD PAGE CHROME** that Story 7.3's How-to-Play page
  reuses. The pattern existed as **two sentences and no component**: a `1100px` token
  (`DESIGN.md:94`, `:201`; UX-DR39 at `epics.md:199`) and *"ESC/back returns home"*
  (`EXPERIENCE.md:37`) — and `1100` appears nowhere in the client as a width, only as a z-index
  (`client/src/config.ts:1734-1745`).
- **R13 — THE REFRESH-RESUME `matchStart` DEFECT IS FIXED IN THIS STORY**, not ledgered.
  `INITIAL_CUE_STATE.lastPhase` is `'connecting'` (`client/src/audio/tones.ts:464`), so the
  `phase === 'active' && prev !== 'active'` edge trips on the first resumed frame and
  `portal.matchStart()` already fires for a match that started ten minutes ago. Measuring through a
  known-wrong edge would make the funnel's match-start count wrong from day one.

### Consequences and disclosures the rulings created

**THE CONSENT RECORD PERSISTS IN `localStorage` AS `hullcracker.consent`, AND THIS IS STRUCTURAL
RATHER THAN A PREFERENCE.** `client/src/app/returnToPort.ts:82` ends every return-to-port with
`.finally(() => deps.reload())` — **every normal loop iteration is a full page navigation** — so
without a persisted record the bar would reappear after every single match. The same fact makes
`sendBeacon` transport mandatory rather than optional for the `requeue` event, since it must leave
before the navigation.

**A PRIVACY POLICY CLAIMING "WE COLLECT NOTHING" WOULD BE FALSE, AND THREE DISCLOSURES ARE EASY TO
MISS.** (a) `client/index.html:7-8,27-30` preconnects and preloads Google Fonts, so **Google
receives every visitor's IP on every page load, today, before any consent surface exists** — out
of 7.2's scope to change, in scope to disclose; self-hosting the two Geist faces would remove the
disclosure entirely *and* delete the `fontWaitMs` boot race, which is a ledger item, not this
story's work. (b) `GET /liveness?c=` records an anonymous per-tab id into server presence with a
30s TTL (`server/src/liveness.ts:265`). (c) `sessionId` is logged on join/drop/resume/leave
(`server/src/rooms/ArenaRoom.ts:856,918,981,984,1024`) **against `server/src/log.ts:9-11`'s own
comment forbidding exactly that** — the callers are right (an ephemeral per-connection id in an ops
line is not PII) and the comment is wrong, so the comment is corrected rather than the code.
Separately, the **callsign is user-entered free text shown to every other player**, which is a
disclosure rather than a collection and belongs in the policy.

**IMPLEMENTER DEVIATION ON R8's MECHANISM, URL PRESERVED EXACTLY.** Eric chose
`client/public/privacy/index.html` → `/privacy`. A file under `public/` is copied verbatim and
**cannot import the token bridge**, so it could not reuse the chrome R12 requires — the two
rulings would have produced two divergent pages. The page therefore ships as a **second Vite entry
at `client/privacy/index.html`**, which Rollup emits to `dist/privacy/index.html` and
`express.static` serves at **`/privacy`, byte-identical to the URL Eric picked**. Recorded here
because a mechanism changed, not a decision.

**WHAT DID NOT MOVE.** Server telemetry is untouched — NFR15's stdout lines stay exactly as they
are, and GA4's only territory is browser-session counts the server structurally cannot see. The
measurement ID rides the existing build-time `VITE_*` mechanism (`client/src/net/connection.ts:234-241`)
rather than a literal, so a fork or a local build never reports into Eric's property. `epics.md:1249`'s
*"Given the live site"* governs and the change proposal's *"Given the static site from 7.1"* (`:523`)
is stale — 7.2 lands on the current single Render service (`gds-workflow-status.yaml`). And
`client/src/__tests__/tokens.test.ts:113` asserts `index.html` holds exactly one colour literal and
`client/src` holds none, so every new surface is built from `--hc-*` tokens or the suite fails.

### R14 — THE CONSENT SURFACE IS A CORNER CARD, NOT A FULL-WIDTH STRIP (ERIC, same day)

R2 shipped first as a `left:0;right:0;bottom:0` strip, which is what "non-blocking bottom bar"
plainly describes. **Screenshot at the RATIFIED FLOOR VIEWPORT (1366x768, UX-DR39) showed the strip
covering the entire underplay block** — HOW TO PLAY, the server register, and PRIVACY, *the AC's own
required policy link and AdSense review's crawl target*, invisible for exactly as long as the consent
question was open. Reserving the strip's height on the port column fixed the covering and bought an
overflow instead (the wordmark clipped at the head, 22px over), and every remaining lever was a pixel
shave against FROZEN LEGAL COPY — which is how a consent notice quietly stops being true.

Eric: *"it could go in a box in the corner couldn't it?"* **It could, and that removes the collision
rather than negotiating with it.** A ~380px card on the bottom-right against a ~480px centred column
cannot share horizontal space at any ratified width, so the column reserves nothing, nothing on home
moves, and the `--hc-consent-inset` machinery built for the strip was **deleted end to end** (the
CSS variable, the publisher, home's `padding-bottom`, the liveness `calc()`, and their pins) in the
cycle-69 grey-NO-DATA style, so no dead knob survives. **BOTTOM-RIGHT is the only free corner** —
bottom-left is the population register, top-right is the settings gear.

**R2's non-blocking promise is UNCHANGED and still structural**: no `top`, no `left`, no `inset`, no
scrim. The card also gains the panel grammar it now deserves (full hairline outline + 12px radius,
the settings/results bed) where the strip carried a single top edge. A new test pins the geometry off
CONFIG — `maxWidth + inset <= (1366 - 480) / 2` — so widening the cap past the free margin fails in
CI rather than in a screenshot somebody has to remember to take.

**THE GENERAL LESSON, worth more than the placement:** a full-width element and a CENTRED column are
in permanent conflict at the floor viewport, and reserving space for one inside the other converts a
covering bug into an overflow bug without fixing anything. This is the container-fit law (amendment
47) arriving from a new direction, and the screenshot found it where reasoning had not.

### Measurements of record (this cycle)

- **NFR2 re-measured on the shipped build with `loadCapture.mjs`** (the ratified instrument, not a
  re-derived method): interactive home **2 521 ms** and **3 289 ms** on two runs of the throttled
  residential profile against the **~10 s** budget. **Run-to-run variance dominates any delta this
  story could have produced** — amendment 7 already recorded a 2.3-3.1 s spread on identical bytes —
  so **NO improvement or regression is claimed from the numbers.** Bundle **310.8 kB gzipped**
  against 7.1's 309 kB: **+1.8 kB** for the whole analytics layer, the consent card, the reusable
  page chrome and the policy page.
- **THE DECISIVE EVIDENCE IS NOT A TIMING, IT IS AN ABSENCE.** The cold-load record contacts
  `fonts.googleapis.com` and **nothing else** — zero `googletagmanager.com`, zero
  `google-analytics.com` — which is Consent Mode BASIC (R7) working, and is the claim NFR2's "must
  not block first paint" actually rests on here. Pinned in code by a test that reads `index.html`
  off disk and refuses any third-party origin but the font CDN, because the runtime tests could not
  catch somebody pasting Google's stock snippet into the head.
- `npm run check` green at **5 202 tests** (746 shared / 1 505 server / 2 951 client), up from 5 127.
  `--verify-bundle` still passes, so NFR17's dead-strip is intact.

### R15-R16 — two ERIC RULINGS taken AT THE REVIEW GATE

- **R15 — CONSENT IS WITHDRAWABLE IN-PRODUCT.** The shipped answer to "how do I change my mind"
  was *clear site data*, which also destroys the callsign, class, colour and every accessibility
  setting — **strictly harder than the single ACCEPT press that granted it**, which is the specific
  asymmetry GDPR Art. 7(3) names. A **PRIVACY section with an ANALYTICS on/off row** now sits in the
  settings overlay. It is wired by **CALLBACK, not by import**, following `ui/consentBar.ts`: the
  overlay stays renderable with no analytics layer, `analytics/ga.ts` remains the only module that
  knows GA4 exists, and every pre-7.2 construction site is byte-identical because the dep is
  optional. An **unanswered** player renders as OFF, which is the truth under Basic mode rather than
  a placeholder — nothing is measured until an explicit grant — so the row is a real second door
  INTO consent as well as out of it, and is the only route left for a player who declined on day one
  and later changes their mind, since the card is gone by then.
- **R16 — GA4'S ENHANCED MEASUREMENT STAYS ON; THE POLICY WIDENS INSTEAD.** The review found a claim
  the story would otherwise have shipped wrong: `send_page_view: false` suppresses `page_view` and
  NOTHING else, while gtag.js independently emits `session_start` / `first_visit` /
  `user_engagement`, and a GA4 web stream ships with **Enhanced Measurement ON by default** —
  property-side settings **no code in this repo can control or test**. `analytics.test.ts` is
  structurally blind to it: it can only ever observe what this client sends. Offered the choice,
  Eric kept the data and took the longer disclosure. The policy now names scroll depth, outbound
  clicks, file downloads, site search and embedded video explicitly, and states which of them this
  game can realistically produce (scrolling and outbound clicks; it has no downloads, no site search
  and no video). **NFR19's "five events" is therefore a statement about what THE GAME REPORTS, not
  about what the property records** — the policy now says exactly that, and so does this ledger.

### The review gate's own findings (2 adversarial passes, both at session model capability)

Both passes independently found the same two highest-severity defects, and **one of them was in the
fix this story wrote**:

- **THE CONSENT CARD WAS NEVER TORN DOWN ON DEPLOY.** `showConsentBar` had exactly one caller and
  `hideConsentBar` had none outside its own module, so an UNANSWERED card at z-1250 — above every
  rung — rode out of port, through the queue modal, into the live HUD, the death banner and the
  results modal, dismissible only by answering it mid-combat. It also **falsified the card's own
  same-tab rationale**: the policy link is same-tab because "the player is standing in port with
  nothing in flight", which stops being true the moment the card outlives the port. Fixed at the
  deploy door; taking it down records no answer, so the question is simply asked again at the next
  port.
- **R13's ONE-SHOT WAS SPENT ON THE FIRST FRAME, NOT THE FIRST KNOWN PHASE — so R13 did not work.**
  `publicState` is `g.room.state ?? {}` and every read falls back to `'waiting'`, so on a
  refresh-resume the flag was consumed by a frame rendered before the schema first synced, and the
  real `waiting -> active` edge a few frames later fired the horn and `portal.matchStart()` anyway.
  The guard now waits for `matchPhase !== undefined`. **The failure was one-directional** — it could
  never swallow a REAL start — which is exactly why it survived the tests: every test drove
  `audioCues` directly with known phases, and the defect lived in the caller.
  Also corrected: the original rationale claimed the funnel hung on that edge. It does not —
  `analytics.matchStart()` lives in `startGame`, which the resume path never calls.

**THE FUNNEL DID NOT RECONCILE, AND NOW IT DOES.** `match_end` fired only from the results modal, so
ABANDON MATCH produced `match_start -> requeue` with no end; and a refresh-resume could report an
`end` for a match this page never saw begin. Both close on one module-level `funnelStartSent` latch
plus a shared `sendMatchEndOnce()` reached from both real exits. The two reloads that reach port with
**no player action** (the passive 45s room disposal, the disconnect timeout) enter neither path, so
they stay excluded structurally rather than by a check that could rot.

**`transport_type` MOVED OFF THE EVENT AND ONTO THE CONFIG.** It shipped as a second parameter with a
comment arguing it was a directive rather than payload. gtag.js accepts it on `config`, so **NFR19's
"the only parameter that ships is `mode`" is now literally true with no exception to document** —
which is strictly better than a well-argued exception.

**THE STATIC GUARD HAD A BLIND SPOT AT THE EXACT PAGE THAT MATTERS MOST.** It read `index.html` only,
leaving `privacy/index.html` — the newer, less-watched entry, and the natural place to paste a CMP
snippet — unguarded. Both pages are now scanned, and the privacy page's single-script shape is pinned
too. Today's build was clean, so this was a guard gap rather than a live leak.

Also fixed: the pre-consent queue evicted its OLDEST entry, which is `home` — the first event queued
and the reason the queue exists — so an overflowing funnel flushed with no beginning; it now drops
the newest. `activate()` cleared the queue BEFORE knowing the tag would build, so a `startGa` throw
discarded `home`/`mode_pick` with no retry. The dev-server redirect dropped the query string (a
policy link is exactly the kind that carries `?utm_source=`) and did not cover `vite preview`.

**Three policy misstatements were caught and corrected, and this is the class of defect worth
naming**: the policy claimed *"do not track" and cookie-blocking settings are respected* when **no
code reads either signal** (deleted — a GPC signal is a binding opt-out in several US states, and
the controller is US-based, so a future GPC read is a real candidate rather than a nicety); it
claimed GA4 *"measures five moments and nothing else"* (R16); and its short version said *nothing is
kept on our servers after your match ends* while its own SERVER LOGS section correctly described
per-connection ids and Render's edge logs. Separately, and found before the gate: the storage
inventory described `hullcracker.session` as a match-resume token when it is the single-session
LOCK, and omitted the legacy `hullcracker-muted` key entirely. **A privacy policy that misstates
collection is a defect, not a wording preference** — every claim in it is now checked against code.

---

## Amendment 15 — The Story 7-3 question gate: THREE ERIC RULINGS, 2026-08-19 (cycle 106)

The story opened with a question gate (`bmad-dev-auto-result-7-3-how-to-play-page-questions.md`,
eleven questions). Eric answered all eleven, then three follow-ups after the first pass was rejected
for jargon — *"ELI5 this shit, I do not have the time nor energy to decypher your technical jargon
hallucinations."* **A question the owner cannot parse is not a question; it is a delay.** The
useful form was plain English plus multiple choice, and the second pass was answered immediately.

### The rulings

**On the standing of the planning docs (Eric, 2026-08-19).** The orchestrator described one of
Eric's copy cuts as "superseding an AC clause", as though `epics.md` had authority he was departing
from. He corrected it: *"YOU decided it was a requirement, I didn't. Whatever the fuck I say is the
requirement, and my mind is known to change."* **The planning artifacts record what Eric wanted when
they were written; they are downstream of him, never a constraint on him.** When he says otherwise
the doc is simply OUT OF DATE. Amendments still record which planning text is dead — that is what
this file is for and future agents need it — but the framing is "the doc is stale", never "the
ruling overrides the requirement", and a cut of his needs no justification against a written clause.

**R1 — SCOPE IS THE BASICS, AND THE GLOSSARY IS STRUCK.** *"No need for a boon glossary, eat shit.
This page needs to give people the basics on how to steer their ship, select weapons, upgrade, and
shoot. They can figure the rest out through play."* This **supersedes the Story 7.3 AC's coverage
list** (three sensor tiers, storm rhythm, classes + slot grammar, boon economy) and **strikes the
boon-glossary clause of UX-DR29 and FR39**. Restated when the structure question came back: *"NO
FUCKING GLOSSARY. One page."* What survives from FR39 is the **win condition**, which is why the
story is a beta gate at all (epic-5 amendment 46(c)) and which Eric had already ruled on 2026-08-14
*"moves to HOW TO PLAY"*.

The glossary was **unbuildable as specified anyway**, and this is worth recording because the AC
asked for it twice: card rules-text is not a string. `boonDescription()` renders a live
`effectiveStats()` diff against the reader's own ship (`"Radar range: 660 → 759.0"`), and a static
page has no ship; `STAT_LINES` is module-private; and Story 7.5 rewrites the catalog wholesale, so
any hand-copied glossary would go stale silently within two stories. The options were "generate from
source" or "ship something that rots". Eric's cut removes the question rather than answering it.

**R2 — KEYS RENDER AS KEYCAPS.** UX-DR33 names "the key-chip family" as if it were one thing. It is
four: the Pixi 22px chip (hotbar/refit/helm), the DOM refit-card 22px square, the 10px inline chip
`ui/page.ts` already uses for its own ESC affordance, and — on the game's *existing* controls
reference (`ui/settings.ts`) — plain phosphor mono with no chip at all. Eric took the bordered
keycap. `makeKeyTable` therefore restates `upgradeMenu.ts`'s chip rather than importing it, per the
precedent already documented in `page.ts`.

**R3 — THERE IS ONLY ONE RADAR, AND THE OTHER ONE IS DELETED.** *"I could have sworn I had the old
'default radar' removed? Guess not. The radar on prod is the ONLY radar. Its too good."* Production
has run `HC_RADAR_GRAMMAR=return` / `HC_RADAR_IDENTITY=pseudonym` via `render.yaml` since cycle 51,
while the CODE defaulted to `silhouette`/`roster` — so the repo carried two sensors and shipped one.
Deleted end to end in the cycle-69 grey-NO-DATA style: the types, the env flags, the resolvers, the
`WelcomeMsg` fields, the perception/signals branches, the whole client silhouette render path, and
two modules left with zero consumers (`render/blipMarks.ts`, `phosphor.ts`'s `blipCool`). Tests that
existed only to prove the deleted mode were RETIRED, not adapted (−49 net).

**`PROTOCOL_VERSION` 40 → 41**, because `WelcomeMsg` loses two required fields. **Pseudonymous
identity is the survivor** — the stricter, anti-cheat-correct half (amendment 63) — and is kept even
though the `return` payload is structurally id-free today, pinned by a new test asserting no wire
blip carries an `id`. **`shared/src/sim/silhouette.ts` was NOT touched**: that is the polygon
geometry library, which merely shares a name with the deleted grammar mode, and confusing the two
would destroy island collision, LOS and hull rendering.

**Evidence the deletion changed no behaviour:** the RETURN golden-frame snapshot is byte-identical
(the diff is one renamed key line; the 134 deleted lines are the old key plus the entire retired
silhouette battery). Verified independently by the orchestrator, not taken on the agent's report.

### Consequences named rather than absorbed

- **The bot tactics tests were validating a perception model production never ran.** `botTactics`'s
  end-to-end movement bar dropped 100u → 50u, because the fixture inherited the TEST-default
  silhouette grammar — id-and-pose-rich bot perception — while production bots have always seen the
  anonymous return wire. Nothing a production room emits moved; the test corrected to reality. **Any
  future bot-behaviour baseline taken before this cycle was measured against the wrong sensor.**
- The `mz`/`sm`/`hc`/`sp`/`sunk`/`fh` exception count is untouched: this deleted a rendering and
  wire *mode*, not a disclosure rule. The master perception invariant still has exactly SIX.
- `PROTOCOL_VERSION` entries 38-40 were never written into `index.ts` (its top entry was 37). Entry
  41 was added in the established style and the gap left as found rather than back-filled.

### Corrections of record

- **Five doc claims are stale on the controls, CLAUDE.md among them**, and the page was authored
  from `input/keyboard.ts` instead: there is **no CTRL binding of any kind** (ctrl/meta/alt are
  returned as native and never reach the game) — the refit window is **TAB (toggle)**, picks are
  **1-4**, and **5 is DAMAGE CONTROL**; slots are **4 per-class**, not "0 gun / 1 torpedo / 2 mine
  universal"; `CONFIG.offer.size` is **4**, not 3; **F is the FOGHORN** and SPACE is bound-inert.
- **The in-game binding reference was itself incomplete** and was fixed in the same change (R2's
  sibling ruling, *"a, fix it"*): it omitted digit 5, the arrow and numpad aliases, and the fact that
  **the gun is slot 0 with no key at all** — the one omission a new player cannot recover from, since
  nothing tells them how to get back to the gun. `P` stays out of BOTH surfaces by ruling; it is a
  netcode debug toggle, and its being un-gated in production remains a separate ledgered NFR17 item.
- **No ad slot ships here.** DESIGN.md contains nothing about advertising — no token, no component,
  no reservation — and 7-2's R14 already ruled that reserving space for a full-width element inside a
  centred column *"converts a covering bug into an overflow bug without fixing anything"*. Story 7.4
  owns ad placement and lands after.
- **The page copy is DRAFT pending Eric's pass** (*"No fucking shit its unratified copy, i said I
  wanted my hand on this one"*), on the `policyCopy.ts` R9 mould: implementer drafts from verified
  facts, Eric approves, then it freezes the way `ui/taglines.ts` is frozen.

### The copy pass (Eric, same day)

The implementer's draft was rejected on sight — *"That is really fucking poorly written. I can't
even rewrite it intelligently because it just SCREAMS 'HI IM AN LLM AND I WROTE THIS.'"* The tell was
nameable and is worth recording so it is not reproduced: **antithesis** as a default sentence shape
(*"a telegraph, not a pedal"*, *"held, not tapped"* — twice in one section), every second paragraph
closed with an **aphorism carrying no information** (*"a ship dead in the water turns nowhere"*, *"the
sea does not wait for you to read"*), *"her"* for the ship, and nine em-dashes in a page of six
sections. Eric's own edits ran in exactly one direction — cut the flourish, say the thing — which is
the register the rewrite adopted: short declaratives, no antithesis, no closers, the naval flavour
carried by the REAL NOUNS (telegraph, rudder, refit, deck gun, astern) rather than by cadence.

**Eric's structural calls in that pass:** `WEAPONS` → **`EQUIPMENT`** (the better word — one of the
two slots is a utility, not a weapon), the six-item enumeration cut to a single sentence, and the
**SOLO VS AI section deleted entirely** (the home screen already carries the mode with `STARTS
INSTANTLY` under it, so the page was restating a button). FR39/UX-DR29's *"positions Solo vs AI as
the live tutorial"* is therefore not built, and per the standing note above that is a change of mind,
not an override. **One mechanic was rescued at the gate**: the rewrite had dropped *"you return to
the deck gun after firing anything else"*, leaving nothing on the page to answer *"I pressed Q, how
do I get back to my gun?"* — unanswerable by experiment, since the gun has no key. Eric added it back.

**Verified rather than assumed:** his new line *"If it has a firing arc, it will be indicated on the
screen"* is true — `render/firing.ts` draws the sector for arc-limited equipment (torpedo bow arc,
mine rear arc) and draws none for the 360° gun.

---

## Amendment 16 — The Story 7-4 question gate: SEVEN ERIC RULINGS, 2026-08-19 (cycle 107)

The story opened with a question gate (`bmad-dev-auto-result-7-4-adsense-questions.md`) because Eric
asked for questions before implementation. Two of the four opening questions existed because **the
story's own acceptance criteria could not be built as written** — the first time in Epic 7 that the
planning text was not merely stale but structurally impossible.

### The blocking findings that forced the gate

**(1) THE HOME DISPLAY UNIT WAS UNBUILDABLE, AND NOT MARGINALLY.** The AC required display units on
home *"≥150 px clear of the game canvas"*. `client/index.html:34` makes the Pixi canvas
`position:fixed; inset:0` — it IS the viewport and is never resized or letterboxed — and since cycle
82 it renders a **live ambient scene** behind home (real terrain, real radar with height shadows and
wakes, real hulls on real `stepShip` kinematics, `render/ambient.ts:1-20`). **Distance from canvas is
zero at every pixel of home**, and cannot be made non-zero without moving ratified anatomy: the
centred column measures ~688 px against the 768 px floor viewport (UX-DR39), about 40 px of total
slack.

**(2) THE CMP AND CONSENT MODE BASIC ARE MUTUALLY EXCLUSIVE — Story 7.2 deferred a composition that
does not exist.** Amendment 14 R1 deferred *"the certified CMP"* to this story, assuming it would
compose with R7's Basic mode (*"nothing Google loads until the player clicks Accept"*). It cannot:
**Google's CMP has no standalone script — it is delivered BY `adsbygoogle.js`**
(https://developers.google.com/funding-choices/fc-api-docs; AdSense's own help requires *"the AdSense
code needs to be located on the page"* for messages to display, https://support.google.com/adsense/answer/10924669).
So the ad script must load BEFORE consent, because it is the thing that ASKS for consent. There is no
configuration in which both hold.

**(3) A DISPLAY UNIT ON HOME WAS AN ACCOUNT-SUSPENSION RISK, not merely a layout problem.**
`app/returnToPort.ts:82` ends every return-to-port with `location.reload()`, so **home re-renders on
every single match end**. A unit there would mint a fresh impression for the same player all session.
Google: publishers *"should refrain from inserting ads in auto-refreshing placements"*, and
*"if Google observes high levels of invalid traffic on an account, they may suspend or close the
account"* (https://support.google.com/adsense/answer/16737). Whether a user-initiated reload counts
as auto-refresh is **undocumented by Google** — and the downside is a years-old AdSense account.

### The rulings

- **R1 — GOOGLE'S OWN CERTIFIED CMP.** `adsbygoogle.js` loads for everyone, pre-consent, and Google's
  dialog asks the consent question. Chosen over keeping the promise (option A) and over a self-driven
  non-personalized posture (option B) because it is the only option that unlocks **personalized ads in
  the EEA/UK/CH**. **Consent Mode BASIC (amendment 14 R7) is RETIRED**, and with it R7's accepted cost
  (*"the funnel measures only players who actively click Accept"*) — under Advanced the tag loads for
  everyone, so that undercount ends.
- **R2 — INTERSTITIAL ONLY. NO DISPLAY UNITS ANYWHERE.** Not on home, not on How-to-Play, not on
  `/privacy`. **This strikes the display-unit clause of the Story 7.4 AC and of NFR8**, and with it the
  150 px clause and the invalid-traffic exposure of finding (3), in one cut. Offered the cheap
  compliant option (How-to-Play only) Eric took the cleaner one instead: in H5 games the interstitial
  is where the revenue is, and a unit on a page nobody visits earns nothing while still carrying
  thin-content risk.
- **R3 — ADS.TXT IS THE VERIFICATION METHOD.** Chosen over the meta tag and the AdSense snippet
  because it is the only one that is **architecture-neutral**: it loads no Google script (so it is
  independent of R1), it survives Story 7.7's move to a CDN static site unchanged, and the file is
  wanted anyway to authorize Google as a seller — one artifact doing two jobs.
- **R4 — THE INTERSTITIAL IS BUILT NOW, DORMANT**, gated on the publisher ID being present at build
  time.
- **R5 — THE SELF-BUILT CONSENT CARD IS DELETED.** Google's CMP becomes the single consent dialog,
  covering ads AND analytics. Outside Europe no dialog appears and analytics simply runs. **This
  retires amendment 14 R2 (the non-blocking bottom bar) and R14 (the corner card) two days after they
  shipped** — not because either was wrong, but because their premise (our banner is the consent
  surface) is gone. The alternative was two dialogs back-to-back for every European player, since
  Google's message shows only in the EEA/UK/CH while our card showed to everyone.
  **Amendment 14 R15's settings PRIVACY row SURVIVES and Eric kept it explicitly** — it is now the
  ONLY in-product analytics door.
- **R6 — THE H5 GAMES ADS APPLICATION IS ALREADY SUBMITTED**, awaiting approval. It is a separate
  application on top of an approved AdSense account and *"approval is not guaranteed as it is subject
  to partner eligibility"* with no published timeline
  (https://developers.google.com/ad-placement/docs/signup), so it is the one dependency this cycle
  cannot shorten. R4 is what makes that latency free.
- **R7 — THE PUBLISHER ID IS `pub-8667818947296707`.** `ads.txt` carries exactly
  `google.com, pub-8667818947296707, DIRECT, f08c47fec0942fa0`; the loader client is
  `ca-pub-8667818947296707`. It rides `render.yaml` beside `VITE_GA_MEASUREMENT_ID`, whose own comment
  establishes the precedent (*"Not a secret… committed deliberately, so that 'which property does
  production report to' is answerable by reading the repo"*). A publisher ID is public by
  construction — it is published in `ads.txt`.

### Verified external facts of record (with sources)

- **NOTHING IN THE PLAN IS DEPRECATED.** H5 Games Ads and the Ad Placement API are current; the signup
  doc carries a **"Last updated June 18, 2026"** stamp and no sunset or migration notice exists.
- **THE 150 px FIGURE IS A RECOMMENDATION, NOT POLICY — `epic-7-context.md` states this wrongly.**
  It says *"The 150 px clearance and the natural-transition-point restriction are Google policy, not
  preference."* Half is right. Natural transition points IS policy and is prohibitive (full-screen ads
  *"that interrupt the user during periods of continuous game play"* are banned,
  https://support.google.com/publisherpolicies/answer/11975916). The 150 px figure is *"we recommend"*
  / *"we strongly recommend"*, published under the heading **"Distance between ads and Flash games"**
  (https://support.google.com/adsense/answer/2768340, /1346295), with **no modern canvas/HTML5
  restatement found**. The real enforcement mechanism is invalid-click detection, not a numeric bar.
  R2 makes the point moot, but the record should not carry a recommendation as a policy.
- **NO CERTIFIED CMP DOES NOT MEAN NO ADS IN EUROPE.** *"Traffic from a non-certified CMP may be
  eligible for non-personalized ads or limited ads"* (https://support.google.com/adsense/answer/13554116).
  The cost of declining R1 would have been personalization revenue in three regions, not a blackout —
  stated at the gate so the ruling was taken on the true price.
- **GOOGLE'S CMP *CAN* CARRY ANALYTICS CONSENT.** An account-level *"Enable consent mode for analytics
  purposes"* flag drives `analytics_storage`; it appears only after *"Enable consent mode for
  advertising purposes"* is ticked, and **both default to OFF**
  (https://support.google.com/adsense/answer/16053245, /16088460). This is what makes R5 safe:
  deleting our card does not strand EEA analytics consent.
- **ADVANCED MODE NEEDS NO WIRING.** *"Advanced consent mode is supported by default; once you have
  enabled Consent Mode in the Privacy & messaging UI, no additional work is needed"* — the CMP issues
  the `gtag('consent','update',…)` itself (https://developers.google.com/funding-choices/fc-api-docs).
- **A BLOCKED AD SCRIPT FIRES NO CALLBACK AT ALL.** Google documents nothing about ad blockers. The
  shim is `adBreak = function(o){ adsbygoogle.push(o); }`, so with the script blocked `adsbygoogle`
  stays a plain `Array` and the push is inert — **not even `adBreakDone` runs**. This is why
  return-to-port may never be gated on an ad callback; `safeAdapter`'s 35 s cap is the only backstop.

### Consequences named rather than absorbed

**THE DASHBOARD IS NOW LOAD-BEARING, AND NO CODE HERE CAN TEST IT.** Both AdSense consent-mode flags
must be ticked by Eric or EEA analytics consent is never collected. This is the same class as
amendment 14 R16's Enhanced Measurement finding — property-side settings this repo cannot control or
observe. It **fails safe**: unticked flags leave EEA visitors at the region-scoped denied default.

**THE CMP APPEARS ONLY WHERE THE ADSENSE CODE IS.** The loader ships on `index.html` only, so
`/privacy` and `/how-to-play` get no dialog and no auto-injected revocation link, and an EEA visitor
on those pages sits at the denied default — no analytics cookie is written there. Fail-safe, and
recorded so it is not mistaken later for a defect.

**THE SETTINGS PRIVACY ROW INVERTS ITS UNANSWERED STATE (IMPLEMENTER DECISION).** Amendment 14 R15
renders an unanswered player as OFF, correctly, *"which is the truth under Basic mode rather than a
placeholder — nothing is measured until an explicit grant."* **That premise is gone.** Under Advanced
with a granted global default, analytics IS running for an unanswered non-EEA player, so OFF would now
be the lie R15 was written to avoid. The row therefore renders unanswered as ON. The ruling behind
R15 is honoured, not reversed: *the row tells the truth about what is being measured.*

**`hullcracker.consent` KEEPS ITS KEY AND SHAPE, AND CHANGES MEANING.** It was *"the answer to our
banner"*; it is now *"the player's LOCAL analytics override"*. Absent means "follow the CMP and the
region defaults", not "unanswered question". It carries `analytics_storage` alone — the three ad
signals belong to Google's CMP now, and our toggle has no authority over them.

**THE PRE-CONSENT EVENT QUEUE IS RETIRED.** Its entire purpose was holding funnel events until a
decision that no longer gates the tag, and `dataLayer` buffers before the script loads. Retired with
its tests rather than adapted — including the review-gate drop-newest fix from amendment 14, whose
reasoning was correct and whose subject no longer exists.

**THE GLOBAL CONSENT DEFAULT NOW GRANTS ALL FOUR SIGNALS (IMPLEMENTER DECISION, flagged not buried).**
The region-scoped EEA/UK/CH default still denies all four and is what protects those visitors; it
finally becomes load-bearing rather than the inert correctness placeholder amendment 14 shipped it as.
Granting ad signals outside Europe follows from R1's own rationale (personalized ads are the revenue
Eric chose), but Google's documentation does not decide it and Eric did not state it in those words —
so it is recorded here as the implementer's reading of his ruling, open to correction.
**Not taken, and Eric's to decide:** Google also offers a separate **US-states message** covering 20
states, which is dashboard configuration and needs no code. It carries no consent-mode integration and
would not affect analytics.

**NOT A SEVENTH PERCEPTION EXCEPTION, AND NOT A WIRE CHANGE.** Nothing spatial or gameplay-bearing
moves. `PROTOCOL_VERSION` stays **41**. The master perception invariant still has exactly SIX declared
exceptions.

### Corrections of record

- **`CLAUDE.md:82` says `PROTOCOL_VERSION` is "currently 40". It is 41** since Story 7-3. Corrected in
  this cycle.
- **`sprint-status.yaml` still showed `7-3-how-to-play-page: in-review`** although PR #171 merged.
  Stamped in this cycle rather than silently, since a landed story must read as landed in both
  trackers.

---

## Amendment 17 — ESC from spectate reopens the SCORE SCREEN (ERIC RULING, 2026-08-19, cycle 107)

Taken mid-cycle, during Story 7-4's review gate, on a surface 7-4 does not otherwise touch. Eric:
*"when you have been eliminated and see the score screen, if I click spectate, I would like the
score screen to open back up, rather than the regular menu."*

**What was actually happening.** SPECTATE's handler was a LITERAL NO-OP (`main.ts`,
`showResults(view, { onSpectate: () => undefined, … })`) — the button's only effect was
`hideResults()`, called by `ui/results.ts` before invoking it. Nothing anywhere in the client could
bring the score screen back: there was no reopen function, no key, and no dead code for one. ESC
from spectate ran `escapeAction`'s final fallthrough and opened the SETTINGS overlay, which is the
*"regular menu"* of the ruling — the home gear is pre-join only, and the port menu is reachable only
through a full page reload, so settings was the only candidate surface.

**The change.** `escapeAction` gains a `spectating` parameter (defaulting to `false`, so every
pre-existing caller is byte-compatible) and a fifth action, `reopenResults`. ESC while spectating is
now a TOGGLE: score screen ⇄ the water.

**THE CONSEQUENCE, TAKEN DELIBERATELY AND FLAGGED RATHER THAN BURIED: settings is no longer
reachable while spectating**, because ESC was its only in-match opener. This does NOT trap anyone —
the score screen's own RETURN TO PORT is a better-signposted exit than settings' ABANDON MATCH, and
it is the button the player just came from. What is genuinely lost is mid-spectate access to the
volume and motion settings. If that matters it wants its own key; it does not want this one back.

**Two sources, and picking the wrong one puts a stale number on screen.** A reopen after the match
has ended replays the STORED view (`Game.lastResultsView`), because the game-end table's numbers come
from the results MESSAGE and are already final. A reopen while still mid-match REBUILDS from live
state, because `updateOpenResults` keeps refining the placement whether or not the modal is on
screen — replaying a snapshot there would restore a placement the roster had already corrected.

**What did NOT move.** The modal still renders exactly SPECTATE + RETURN TO PORT and the
NO-INSTANT-RE-QUEUE pin is untouched; ESC ON the modal still means SPECTATE (epic-2 amendment 23);
`canOpenElimination`'s one-shot still guards the `sunk` path; and a LIVE player is unaffected —
pinned by a test, because a stray ESC throwing a full-screen score overlay over a moving ship would
be a combat hazard rather than a convenience.
