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

---

## Amendment 18 — ONE display unit, beside the score screen (ERIC RULING, 2026-08-19, cycle 107)

**This supersedes amendment 16 R2 in part, hours after it was taken, and that is not a defect** —
the standing note from amendment 15 governs: *"the planning artifacts record what Eric wanted when
they were written; they are downstream of him, never a constraint on him."* R2's reasoning was
never *"display advertising is wrong"*; it was that the two places 7-4 proposed putting it were both
unbuildable or unsafe (the home canvas is `inset:0`, and home re-renders on every match end). He has
now found a third place neither of us considered, and it has neither problem. Eric:

> *"I would like some normal display ad space on the results screen. I think this is a good place
> for it for now honestly. I don't want it in the results modal. but off to the side or something,
> only visible while the end game screen is up. If you spectate, it goes away. If you hit esc to get
> back to score screen, there it is."*

Followed by a placement choice at a question gate: **a RESPONSIVE unit, on the RIGHT side.**

**Why this placement escapes R2's two objections.** The score screen is not gameplay — the player
has been sunk and their own match is over, which is the same argument that makes the interstitial a
permitted "natural transition point". And it is not the home screen, so it does not re-render on the
`location.reload()` that ends every return-to-port.

**IT DOES NOT NEED H5 APPROVAL.** Display units require only site verification on an approved
AdSense account; the separate H5 Games Ads application gates the INTERSTITIAL alone. So this unit
can begin earning before the interstitial does — the first revenue this project has ever had.

**THE HARD PART IS AMENDMENT 17, NOT THE AD.** Because ESC now toggles the score screen, the modal
opens and closes many times in one match. Pushing a slot to `window.adsbygoogle` is what REQUESTS an
ad, so a naive implementation would mint a fresh impression on every ESC press — precisely the
auto-refresh pattern Google suspends accounts over. **The slot is therefore created and pushed
EXACTLY ONCE PER MATCH and merely SHOWN/HIDDEN with CSS thereafter**, pinned by a test that toggles
repeatedly and asserts a single push. The two rulings interact, and anyone re-deriving either one
must re-derive this together with it.

**NOTHING IS SHOWN UNTIL GOOGLE REPORTS THE AD FILLED.** The container reveals only on
`data-ad-status="filled"`. A blocked client never receives the attribute and an unfilled slot reports
`"unfilled"`, so in both cases the player sees NOTHING — no empty box, no bed, no reserved hole.
This is the shape that keeps "the game is fully playable with ads blocked" visually true as well as
functionally true.

**A SECOND BUILD-TIME GATE.** A display unit needs a SLOT id, which is a distinct artifact from the
publisher id and did not exist when this was ruled. `VITE_ADSENSE_SLOT_RESULTS` gates it exactly as
`VITE_ADSENSE_CLIENT` gates the loader: missing or malformed ⇒ no element, no push, no observer.
`render.yaml` carries it COMMENTED OUT rather than invented.

**Consequences recorded rather than absorbed:** the privacy policy's *"there are no banners or boxes
anywhere on the site"* became FALSE the moment this shipped and was rewritten in the same change —
the standing rule that a policy misstating collection is a defect, not a wording preference, applies
just as hard to a policy misstating ADVERTISING. The unit sits on the `--hc-panel` bed with a
hairline border rather than floating on live ocean, which is both design-consistent and materially
strengthens the placement's footing under Google's (recommendation-grade) clearance guidance.

### The panel moves (ERIC RULING, same day) — and it was worth 350px of viewport

The first build kept the results panel DEAD CENTRE and squeezed the ad into the right gutter, which
made the fit rule `(W − 620)/2 ≥ column + gap` and put the breakpoint at **1352px**. Below that the
unit was hidden and earned nothing — losing every 1024- and 1280-wide laptop, which is a large share
of the audience for a browser game. Eric, unprompted: *"you can move the results screen over to make
room for the ad unit to the right if needed. idgaf."*

**The panel and the ad are now centred AS ONE GROUP**, so the rule becomes
`panelWidth + gap + column + 2×edge` = 620 + 24 + 326 + 32 = **1002px**. The panel shifts a constant
−175px (`−(gap + column)/2`, viewport-independent) and the ad's offset is recomputed from the same
group arithmetic, so the gap between them cannot drift. **The reachable-viewport gain is the point of
the ruling, not a side effect** — 1024 and 1280 both move from "no ad" to "ad".

**THE PANEL MOVES ONLY WHEN THE AD HAS ACTUALLY FILLED, and this is the safety rule that must survive
any future edit.** A blocked client, an unfilled slot, a missing slot id, an unconfigured build, or a
viewport below the breakpoint ALL leave the panel exactly where it has always been. An off-centre
score screen sitting beside empty space is worse than either a centred screen or an ad. The shift is
reverted on SPECTATE, on teardown, and on a resize below the breakpoint; a stale offset outliving the
ad is the specific failure mode under test. Both directions are MUTATION-PROVEN — forcing the shift
on fails the blocked and unfilled cases, forcing it off fails the shifted cases.

`ui/results.ts` gained exactly one hook (an exported id on the panel element, since it previously had
no handle at all); `PANEL_CSS` and `OVERLAY_CSS` are byte-identical and the offset is written by the
ads layer as a transform. The dependency direction stays ads → ui, so the containment pin holds
unwidened. **Known and accepted:** at viewports 1002–1017 the group's 16px edge margin is inside the
overlay's own 24px padding, so the panel escapes its padding box by 8px. Raising the edge to 24 would
have cost that band entirely; the band is worth more than the 8px.

---

## Amendment 19 — The privacy policy speaks as Hullcracker.io (ERIC RULING, 2026-08-19, cycle 108)

**This SUPERSEDES R11** (amendment 14), which ratified *"THE DATA CONTROLLER IS ERIC AS AN
INDIVIDUAL OPERATOR, UNITED STATES"* and put that identity into the published copy at
`WHO RUNS THIS` and `CONTACT`. Eric, the day after it shipped:

> *"remove my [name] and information that can be traced to IRL me from the game text (in the
> privacy policy). When referring to anyone, just refer to 'Hullcracker.io'"*

The legal name, the "individual operator" framing, the country of residence and the
*"there is no company behind it"* line are DELETED. `WHO RUNS THIS` now says the site and the game
on it are run by Hullcracker.io and points at the contact address; `CONTACT` is `Hullcracker.io`
plus that address and nothing else.

**THE WHOLE POLICY CONVERTS TO THIRD PERSON, NOT JUST THE TWO IDENTITY LINES** — and that is the
half of this ruling most likely to be misread as scope creep. Eric's instruction had two clauses,
and the second one governs the other ~40 sentences: a policy that deletes the name but keeps saying
*"we do not check it"*, *"stored on our servers"*, *"outside our control"* is still referring to the
operator, by a pronoun instead of a noun. Defining "we" once as Hullcracker.io was considered and
rejected as a dodge of a plainly worded instruction. The actor is now `Hullcracker.io` or a concrete
non-personal noun where a fourth "Hullcracker.io" in one paragraph would read badly — *"our game
server"* → *"the game server"*, *"our hosting provider, Render"* → *"the hosting provider, Render"*,
*"we never send it in the first place"* → *"it is never sent in the first place"*. Register per R9
is unchanged: plain English prose, nothing terse or naval.

**NO BEHAVIOURAL DISCLOSURE MOVED; THE IDENTITY DISCLOSURES WERE REMOVED BY RULING.** The earlier
blanket *"no fact moved"* was over-broad and is corrected here — an over-broad safety claim is what
stops the next reviewer re-checking. What is true: `policyCopy.ts`'s own standing rule governs, so
a voice rewrite may not weaken, strengthen or blur a claim about shipped behaviour, and that set is
identical before and after. What was deliberately removed is the operator's name, entity type and
country — and *"There is no company behind it"* goes with them, **permanently**.

**THAT SENTENCE IS ENTITY DISCLOSURE, AND THE REVIEW GATE GOT IT WRONG.** Two reviewers flagged its
deletion as collateral damage; the orchestrator agreed and restored it; **Eric struck it again
immediately** — *"Remove the 'there is no company behind it' line, wtf dude? I gave you clear
instructions."* He is right, and the reasoning error is worth recording because it is easy to
repeat: **saying no company exists says a person does.** It is the same disclosure as *"individual
operator"*, one inference further along, and it is exactly what the ruling removes. The reviewers
were reasoning about what a READER is owed; the ruling is about what the OPERATOR discloses, and
the ruling governs. It is now pinned by name (`/no company behind/i`) so the next well-meaning
review cannot argue it back in.

**THE PASSIVE VOICE IS THE TRAP, AND IT BIT TWICE BEFORE THE GATE CAUGHT IT.** A pronoun swap looks
mechanical and is not, because dropping the actor changes the SCOPE of a claim. (a) *"**We never
send** Google anything about your match for advertising purposes"* was rewritten as *"**Nothing
about your match is ever sent** to Google for advertising purposes"* — the first is a promise about
what the operator transmits, the second an absolute about the data's destination, and the second is
**unsupported by the shipped code**: five GA4 events do reach Google, and `analytics/consent.ts`
GRANTS `ad_user_data` and `ad_personalization` by global default (only the EEA/UK/CH region default
denies). A voice change had silently manufactured a stronger privacy promise than the game can
keep. (b) The COPPA-adjacent CHILDREN undertaking became *"write to … and **it will be looked
into**"* — an agentless passive on the one commitment where an accountable party is the entire
point. **THE RULE, for anyone editing this file again: `Hullcracker.io` is the SUBJECT; never
reach for the passive to avoid naming an actor.** Three narrower recasts were corrected the same
way (*"never sent to the game's servers"* → *"never sent to Hullcracker.io"*, twice, since "the
servers" promises about one recipient where the operator has several routes; and the fonts
intention and the server-log purpose, both of which had lost the party committing to them). **R10 is untouched** — `contact@hullcracker.io`
is not personal information and remains the route for every request, named in both identity
sections. `POLICY_UPDATED` stays `19 August 2026`, which is correct for a contents change made that
day. Section order, bullet content and the `PolicySection` shape are unchanged, and so is every
heading **but one**: `WHY WE ARE ALLOWED TO DO THIS` becomes **`WHY THIS IS ALLOWED`**. The
implementer left it frozen and was right to under its written constraint — Story 7.2 froze the
headings with the copy — but the constraint was drafted to stop structural drift, not to preserve
the single first-person token in the document, and **a heading saying WE is the same reference to
the operator the body text just stopped making**. Eric's instruction governs the constraint that
was written to serve it. The first-person sweep therefore runs over headings AND body text, with
nothing exempt. This is the ONE deviation in the cycle from the spec's own `Always` list, taken
deliberately and recorded here rather than absorbed silently; it is a one-word revert if Eric
disagrees.

**One trap for a later redaction pass:** *"Data may be processed outside your country, including in
the United States"* in `WHAT ANALYTICS NEVER SEES` is GOOGLE's processing location, not the
operator's home, and MUST SURVIVE. A blanket search-and-destroy on the country name would delete a
required third-party disclosure. It is pinned.

**The copy had zero content coverage before this cycle**, which is why the identity could sit in a
frozen file and why nothing would have stopped it creeping back. `client/src/__tests__/privacyPolicy.test.ts`
now pins each row of the matrix. **Two properties of that test are deliberate and each looks like a
gap until you know why.** (1) **It carries NO NAME DENYLIST, and must never gain one.** A pin
reading `not.toMatch(/<surname>/)` would write the redacted name into a tracked file of a PUBLIC
repository — the guard would republish exactly what the ruling removes, and a `grep` for the name
would still find it. `WHO RUNS THIS` and `CONTACT` are pinned **VERBATIM** instead, which is the
stronger pin anyway: they admit no name because they admit no other text at all. What is swept by
pattern is the SHAPE a re-identification takes — entity types, location phrasing (`based in`,
`located in`, `operated from`, `resident in`, so a city or a different country is caught as well as
the original), and any email address other than `POLICY_CONTACT`. (2) **First-person SINGULAR is
pinned alongside the plural** (`I`, `me`, `my`, `mine`, `myself`, plus `ourselves`), because the
operator is one person and *"I do not store it"* is the likeliest way the voice returns; `us` is
matched case-SENSITIVELY so the required *"including in the United States"* disclosure can be
shortened to *"the US"* one day without tripping the voice pin. The heading sweep, the `you`/`your`
presence check, the Google processing-location sentence and the privacy page's `<head>` (where a
byline would land with no `POLICY_SECTIONS` pin firing) are pinned too, and the voice regexes carry
their own positive AND negative controls so they cannot silently stop catching anything.

**WHAT THIS ERASURE DOES AND DOES NOT REACH, stated plainly so nobody over-reads it.** It changes
the page a player can read, at HEAD. It does NOT reach: prior commits of `policyCopy.ts` (the name
is in this repository's history and a public remote's history), commit authorship metadata, this
planning ledger, or any already-deployed build until the next deploy. Erasing those is a different
and much larger operation — history rewriting on a public remote — and was neither asked for nor
attempted.

**FLAGGED, NOT BLOCKING — a legal consequence recorded rather than absorbed.** GDPR Art. 13(1)(a)
and comparable regimes expect a privacy notice to IDENTIFY THE CONTROLLER, and "Hullcracker.io" is a
trading name rather than a legal identity, so the notice no longer names one. The ruling governs;
this is recorded so that a future compliance pass finds a decision here rather than an oversight.
The practical route for any access, deletion or objection request is the working contact address,
which the policy carries in both identity sections and in `YOUR RIGHTS`. **Anyone tempted to
"restore" a named operator as a missing disclosure must get an Eric ruling first — the absence IS
the ruling.**

Text only: no analytics, consent, ads, liveness or runtime behaviour was touched, no other
player-facing surface carried the identity (a sweep confirmed `policyCopy.ts` was its sole carrier),
and `PROTOCOL_VERSION` is unchanged at **41**.

## Amendment 20 — UPGRADE CARDS v2: the catalog is Eric's, stated in full (ERIC DESIGN, 2026-08-19, cycle 109)

Story 7-5 does not proceed on an implementer's taste, and it did not. Eric authored
`_bmad-output/implementation-artifacts/7-5-decks.md` — every card line, its copies, its effect, and
the three system replacements — after an editing surface (`7-5-upgrade-catalog.md`) printed the
shipped 33 lines with their real base → max numbers so he could edit against facts rather than
memory. **`7-5-decks.md` is the content source of truth; `spec-7-5-upgrade-cards-v2.md` is its
engineering projection, and the two wave plans are the orchestrator's rulings inside his shape.**
An implementer may not invent a mechanic here; where a scalar he did not state was needed it is
marked `[DRAFT]` in the plan and named in this ledger.

**The shape of the result.** **33 catalog lines → 29** (23 card lines + 6 acquisitions). **Every
ACQUIRABLE equipment's subdeck is exactly 6 cards** and **every hull's deck is exactly 41**, down
from 53 / 55 / 58. One correction of record against the plan's own summary sentence, measured by
printing `buildDeck` with no simulation involved: **the gun's subdeck is 3** (BARREL ×2 + EXTRA
TURRET ×1), because the gun is never acquirable and has no acquisition card. 41 = 22 universal +
3 gun + 6 + 6 (the two carried equipment subdecks) + 4 acquisitions, and the arithmetic works out
to 41 either way.

**Shipped in two waves.** Wave 1 was the answer-independent half — the stat model, the catalog
rewrite, the deletions — landed at **`PROTOCOL_VERSION` 41 → 42**. Wave 2 was the three system
replacements plus the two cross-system mechanics, landed at **42 → 43**. Catalog content IS wire
contract (epic-6 amendment 23's precedent), so both halves bumped.

**Deleted outright, each removing its only consumer:** `gunDamage`, `torpedoDamage`,
`torpedoCommand` (COMMAND DETONATION, end to end), `mineDamage`, `mineMax`, `starRadius`,
`boostMax` (split into `boostDuration` + `boostSpeed`), `cannonDamage`, `cannonArcing`, `cannonAp`,
`acquireCannon`, `decoyDuration`, `mineSelfPropelled` — and with that last one, the creep machinery
itself (`creepSpeed`, `creepAcquireRange`, the client mine-movement path). **A mine is moored now.**

**Two ladders changed SHAPE, not just value.** SPEED (`kinematics.maxSpeed`) and RANGE
(`radarRange`) went MULTIPLICATIVE → **ADDITIVE** (+2.5 and +50 per copy), and `starDuration` went
additive too (+1250 ms). **SPEED touches `maxSpeed` only** (orchestrator ruling R6, flagged to
Eric): today's card also scaled `reverseSpeed` ×1.05 to preserve the reverse:forward ratio, and
under an additive step no constant preserves that ratio across three hulls — a flat +2.5 on reverse
would take the Battleship 9 → 19 (+111 %) against its top speed's +29 %. Eric's document says
*"increases ship top speed by this amount"*, so `reverseSpeed` is now addressed by no card at all.

**A copy rename is not an id rename** (R1, the KILL LEADER precedent, epic-4). PHOSPHOR SHELLS
keeps the id `starIncendiary`; HULL/SPEED/INTEL/RANGE/RELOAD keep `shipHull`/`shipSpeed`/
`intelSweep`/`intelRange`/`shipCooldown`. Only `boostMax` → `boostDuration` + `boostSpeed` and the
genuinely new lines mint ids.

**One retune landed mid-wave because the card copy had got ahead of the sim.** Eric's document says
PROP FOULING is *"25% slower for 5 seconds"*; `CONFIG` still held 50 % / 4 s, so the card shipped in
wave 1 was describing a weapon the server did not run. `foulFactor` 0.5 → 0.75, `foulDurationMs`
4000 → 5000; the golden frames moved exactly one value (`slowedUntil` 4050 → 5050) and nothing else.

---

## Amendment 21 — EXCLUSIVITY IS DELETED, and the verb-flag retooling is what made it possible (ERIC RULING 4 + IMPLEMENTER)

Eric's fourth standing ruling for this story was *"mutual exclusivity REMOVED; SOME cards retooled
as 'added verbs'"*. **The retooling turned out to be load-bearing rather than tidy-up, and that is
the durable lesson here.**

**The mechanism could not express what he asked for.** A weapon's doctrine was a SINGLE-VALUED
`mode` enum (`StarShellsMode`, `MineMode`, `TorpedoMode`, `CannonMode`) — a field that physically
cannot hold two added verbs. Deleting `exclusiveWith` alone would have shipped an incoherent state
where holding PHOSPHOR and DAZZLE meant whichever card was folded last simply overwrote the other.
So the enums became **independent VERB FLAGS**: `starShells.phosphor` + `starShells.dazzle`,
`mine.propFouling` + `mine.captive`, `torpedo.homing`. That single change is what makes
**PHOSPHOR + DAZZLE** and **CAPTIVE + PROP-FOULING** buildable at all — and Eric's wave-2 answer A1
then made the second pair explicit, including that a captive mine's torpedo hit CARRIES the foul.

**The fold changed; the firewall did not.** `BoonDoctrineEffect` keeps its `{kind:'doctrine',
weapon, mode}` shape and the `doctrine()` authoring sugar is unchanged — `applyBoonStats` now SETS
A BOOLEAN NAMED BY `mode` instead of overwriting an enum, and `DOCTRINE_MODES` stays the
fail-closed authoring vocabulary. Minimal diff, same `effectiveStats()` derivation path.

**The wire moved with it:** `LitZoneView.mode?: StarShellsMode` → `LitZoneView.phos?: true` +
`LitZoneView.daz?: true`, both optional and omitted when false (the established optional-flag wire
style). A lit zone may now carry BOTH.

**A REAL MUTUAL-EXCLUSION BUG WAS HIDING BEHIND THE ENUM, on both sides.** `markZoneEffects` was an
`else-if` chain, so a both-phosphor-and-dazzle zone could only ever do ONE of the two; the client
had TEN exclusive-branch sites of the same shape. Both were converted to independent checks and
pinned by tests proven to discriminate (reverting to the chain fails them). **This is the class of
defect the deletion existed to remove, and it was already latent the moment the flags could
co-occur.**

**The mechanism died in two steps, deliberately.** Wave 1 STOPPED USING exclusivity but did not
delete it (R4), because the `cannonArcing`/`cannonAp` pair genuinely contradicted — AP never bursts,
arcing bursts on click — and independent flags there would have shipped an incoherent weapon. That
pair was the mechanism's last user, and wave 2 deleted the cannon and the mechanism together:
`exclusiveWith`, the `validateBoonDef`/`validateCatalog` symmetry checks, `boonReplacesLine`, the
doctrine swap-out, `returnCards` and the client's REPLACES grammar are all gone. **The former
`exclusive` RARITY TIER is extinct**, and the verb cards that used to carry it are now `rare`.

---

## Amendment 22 — The cannon is DELETED; the BROADSIDE BARRAGE replaces it (ERIC DESIGN, wave 2)

`EquipmentId` `'cannon'` → `'broadside'`, not kept alongside. The Battleship fit becomes
`[gun, broadside, starShells, empty]` — broadside on Q, star shells unchanged on E — and
`acquireCannon` becomes `acquireBroadside` for the other two hulls.

**The arc is taken VERBATIM from history, not invented.** Eric: *"This will use the old side firing
arcs that were in one of the older versions of the game, if you still have reference to those."* We
did: commit **`26318d5`**. `ArcShape` gains a new kind `{ kind: 'twin-sector'; offset; halfArc }`
meaning two mirrored sectors at `heading ± offset`, with **`offset = 90°`, `halfArc = 60°`** read
straight off that commit — port covers 30°–150°, starboard −30°–−150°, leaving **60°-wide dead
zones dead ahead and dead astern**. The side whose sector contains the click bearing is the side
that fires; there is no "both sides at once". A click outside both sectors is DENIED through the
existing denial path, never silently (FR12).

**The fan is ANGULAR at the click's range**, which is the geometry that makes it a broadside rather
than a shotgun: every shell ends its run at the CLICK'S RANGE and the pattern is an arc at constant
radius, spread about the click bearing. **The straddle rule** — odd turret count puts the middle
shell exactly on the bearing, even count straddles it with NO shell on it — is Eric's, and it is now
ONE shared function (`shared/src/sim/spread.ts`) that the broadside fan and BARREL both call,
replacing a formula that had been duplicated verbatim in server `guns.ts` and client
`aimPreview.ts`. 20 damage/shell, `burstRadius` 15u `[DRAFT]`, 30 s reload, pool 1, shell speed 500,
**3 turrets base → 5 at BROADSIDE TURRETS ×2**.

**IT IS THE FIRST WEAPON IN THE GAME NOT AT FULL RADAR REACH.** Eric: *"This weapon's range is
limited to 5/8."* `broadside.rangeU` is DERIVED as `radarRange × CONFIG.vision.muzzleFlashFactor`
(0.625) and re-pinned post-fold in `clampStats` exactly as the other `rangeU` paths are — **412.5u
base, 537.5u at max RANGE** — and is therefore NOT on `BOON_STAT_PATHS`. It is the eighths ladder's
5/8 rung doing a fourth job, and it scales with `intelRange` by construction (epic-6 amendment 22).

**SIGNALS ARE PER SHELL (Eric A2), and this is a deliberate disclosure widening.** Each shell in a
barrage emits its OWN `mz`, its own `sp` and its own `hc`, exactly as an ordinary gun shell does.
No salvo aggregation. **Two supersessions of record:**

- **Epic-4 amendment 17's *"exactly one `hc` per shell resolution"* STILL HOLDS, and now means one
  per SHELL OF A BARRAGE** — a 5-turret salvo legitimately produces up to five hit calls. The clause
  was written for the AP shell's multi-hull pierce, and that case is deleted with the cannon; the
  rule survives its original motivating example.
- **`emitMuzzleFlash`'s per-owner-per-tick dedupe gains its FIRST declared opt-out** —
  `perShellFlash`, the broadside's. The dedupe exists so a multi-barrel gun salvo cannot leak the
  barrel count; the barrage opts out because **the barrage IS the spectacle**, and five muzzles
  along the engaged beam is the ruling's intent. The row's contract is untouched — still `{k,x,y}`,
  no shooter id, no hue, no weapon type, gated by the observer-scaled 5/8 halo and island LOS. A
  gun click in the same tick still gets its own single flash, because a per-shell spawn neither
  reads nor writes the per-owner set. **The MULTI-BARREL GUN still collapses to one `mz`** — epic-4
  amendments 19/20 are intact. **A SECOND departure from that dedupe arrives with the gun buoy
  (amendment 22), by a different route: it bypasses the helper entirely.**

**Deleted with the cannon:** `CannonMode`, `cannon.mode`, `shell.ts`'s plunging-fire branch, the AP
pierce path, `CONFIG.cannon`, the `bulwark`/`siege` bot profiles' cannon lines, and the whole
exclusivity mechanism (amendment 20).

**A review-gate defect worth carrying:** the client's fan preview and the server's resolution
diverged at the map rim — the preview promised bursts the server resolved as expired-at-the-rim.
Both now go through ONE shared `fanBurstPoints()` that clamps each point inside the water disk, and
the server derives bearing and muzzle from the same clamped point. **The client's private clamp was
deleted rather than corrected**, which is the only fix that cannot drift again.

---

## Amendment 23 — The decoy buoy becomes the RADAR BUOY; the DECOY ROLE IS GONE (ERIC DESIGN + FOUR MID-FLIGHT RULINGS, 2026-08-19)

`EquipmentId` `'decoyBuoy'` → `'radarBuoy'`, `acquireDecoy` → `acquireRadarBuoy`. **Nothing in the
game fakes a ship contact any more** — the decoy role is deleted, and Eric's note is that it may
return someday. What replaces it is a sensor you leave behind.

**The buoy.** Its own radar at a **flat 330u** (`[DRAFT]`, deliberately NOT observer-scaled — it is
the buoy's own set, not the owner's build), its own sweep at 15 RPM, 50 HP, click-placed on the
mine's rear sector (±60° at `placeRange` 150u), pool 1. **It paints on radar with its OWN profile
and NO owner identity** (Eric A4) — enemies see it like anything else and nothing on the wire says
whose it is. Killing one pays NO XP and prints NO kill-feed line.

**R2.8 — THE RELAY IS RADAR RETURNS ONLY, NEVER VISION.** The buoy is a second observer for
`blipGate` and nothing else: no sight bubble, no truesight, no LOS grant. Island shadowing and the
height-aware `radarShadow.ts` march apply **from the BUOY's position**, because it is a real radar.
Its returns merge into its owner's frame and are wire-indistinguishable from directly-observed ones
— pinned client-side by `blipProvenance.test.ts`, which asserts identical paint snapshots, no
provenance key, and that a deliberately TAGGED blip still paints identically (that last case goes
red the moment anyone adds a provenance branch).

### The four Eric rulings taken mid-flight, each with its date

**(1) 20s life on a 30s reload (2026-08-19) — SUPERSEDES the earlier 30s/20s ordering.** The
consequence is ledgered rather than fudged: **at BASE cooldown at most ONE buoy is live**, with a
~10s dead gap between one expiring and the next being available. No implementer may "helpfully"
restore overlap by raising `maxAmmo` or shortening `reloadMs`.

**(2) R2.20 — the buoy card is DURATION, not sweep (2026-08-19).** *"change the upgrade from sweep
speed to duration. + 2.5 seconds per level."* `buoySweep` is replaced by **`buoyDuration`**
(`radarBuoy.durationMs` +2500, ×4); the card NAMES `BUOY I–IV` are unchanged, only the stat behind
them moved. The buoy's sweep is now FIXED at `CONFIG` with no card driving it, and `sweepRpm` stays
**whitelisted-but-unwritten** on `BOON_STAT_PATHS` (the established shape — `gun.burstRadius`, the
seven `reloadMs` paths) so a future sweep card needs no whitelist change. **The ladder closes the
gap ruling (1) opened**: a full ×4 stack reaches exactly 30 000 ms = the base reload, so a maxed
buoy build has continuous coverage. That is an EMERGENT consequence of his two numbers meeting his
reload, flagged as such, not a designed reward curve — and it is pinned, so if either number moves
the reading breaks loudly. **The gap also closes from the other end and that is intended too:** the
buoy is NOT exempted from the global `cooldownScale`, so a full RELOAD stack lands the reload at
15 000 ms against a 20 000 ms life and puts TWO buoys on the water. Exempting it would have made it
the odd equipment out.

**(3) R2.21 — THE GUN BUOY IS AUTONOMOUS (2026-08-19), superseding R2.10's hostile gate.** *"It has
its own radar and is autonomous, so when it has the gun upgrade, it should target basically anything
it sees that isn't the owner of the buoy. Closest target proximally to the buoy."* 5 damage on a
5 000 ms cooldown; **target set = anything the BUOY'S OWN RADAR can see** within 330u — enemy
captains, bots and neutral fleet drones alike, with island LOS and height shadowing applying,
because **if the buoy cannot see it, it cannot shoot it**. Owner and the owner's other buoys are
excluded. **Selection is NEAREST TO THE BUOY**, not to the owner. R2.13's aggro gate stays
CAPTIVE-MINE-ONLY and is neither widened nor narrowed by this: a captive mine is a trap the owner
laid and gates on aggro; a gun buoy is an autonomous turret and does not.
  - **R2.21a (orchestrator, by precedent, flagged to Eric and open to reversal): a buoy's gun hit
    aggros NOBODY.** `drones.ts` already excepts mines from attacker-acquisition because *"a mine's
    layer may be dead or across the map, so there is nothing to chase"*, and a buoy is exactly that
    case. The alternative — the drone acquiring the OWNER — was rejected: an autonomous turret must
    not pick fights its owner then inherits.
  - **Defaulted, open: a gun buoy does NOT shoot a rival buoy.** Buoy-vs-buoy turret duels resolve
    with no player input at all, and the buoy's stated job is watching water, not area denial. One
    line to flip.

**(4) The gun buoy FLASHES when it fires (2026-08-19).** It shipped silent, and that was an
omission rather than a stealth property: `emitMuzzleFlash` is keyed off a `ShellState` and this
turret is hitscan, so it never reached that path. **A gun fires, a gun flashes.** It is emitted RAW
rather than through the helper, deliberately — the helper dedupes per OWNER per tick, so sharing its
key would let a buoy shot and its owner's own gun click in the same tick collapse into ONE flash
drawn at only one of two DIFFERENT positions, putting a flash where nothing fired and hiding one
where something did. A buoy fires at most once per `gunReloadMs` and needs no dedupe of its own. The
row's contract and its perception oracle needed no change: the oracle never required a backing
shell, only the payload shape, the halo and LOS.

### Presentation

**The buoy icon shares NO primitive with a mine.** A mine is circles; the buoy is a waterline tick,
a spar and a diamond daymark, with **zero circles**. The old decoy mark was concentric rings, which
is precisely why it read as a mine — Eric asked for the distinction by name. No new colours: the
doctrine channels ride the already-ratified non-colour vocabulary (solid vs dashed, low-alpha fill).

**Two live player-facing lies were fixed in passing, both found by reading rather than by a failing
test:** class select advertised the Battleship's Q slot as `LONG-RANGE CANNON` (a deleted weapon)
and the Mine Layer's E as `DECOY BUOY`. And a real parity bug: the client's range gate covered only
`mine` on `placeRange` while the server also refuses a long `radarBuoy` click, so a far buoy click
silently consumed the prime for a drop the server denied.

---

## Amendment 24 — CAPTIVE MINES, star-shell gun reach, and BARREL fires PARALLEL (ERIC DESIGN + TWO MID-FLIGHT RULINGS)

**CAPTIVE MINES (`mineCaptive`, mines/rare ×1) fundamentally re-arms the weapon.** Trigger and
blast SWAP (32 ↔ 48), then trigger ×3 → **trigger 144u, blast 32u**, derived post-fold in
`clampStats` beside the existing `triggerRadius` re-pin. The swap-and-triple is LINEAR, so MINES
cards compose on top and **card order cannot matter** (verified 210.83 / 46.85 both orders — the
same defect class epic-6 amendment 25 fixed on `mine.damage`). It holds ONE **un-upgraded** torpedo
(base speed, no torpedo boons) dealing MINE damage at MINE blast radius, fired at the first hostile
to enter range with intelligent lead, dodgeable, mine expended on fire. It keeps the 3 000 ms arm
delay and still counts against `maxLive`.

**"Hostile" is CAPTIVE-ONLY (R2.13, Eric):** an enemy captain or bot, OR a fleet drone whose CURRENT
acquired target is the mine's owner — read LIVE off the existing `FleetController` target state, so
a drone that breaks off becomes safe to sail past again. Neutral drones are ignored. **Ordinary and
prop-fouling mines still trigger on ANY drone**, and a mine hit still does not aggro a drone.

**R2.18 — A CAPTIVE MINE CANNOT BE SELF-DETONATED (ERIC RULING, 2026-08-19).** *"the captive mines
can no longer be self-detonated."* The game's standing rule — your own gun/broadside burst detonates
your own armed mines inside `burstRadius`, and the same-owner chain propagates — **does not apply**.
A captive mine is excluded from `detonateMinesInBurst` and from the chain entirely, and **it neither
blasts NOR launches**: the burst passes over and the mine persists, armed and waiting. This is the
literal reading and the consistent one — R2.12 already says the torpedo is its ONLY attack, and
self-detonation was the last surviving path by which a captive mine could produce a blast centred on
its own casing. **After this there are none.** Fail-proven in both directions, including the
not-widened half: the same burst still detonates an ordinary mine.

**R2.19 — the captive torpedo's UNLIMITED RANGE is ACCEPTED (ERIC RULING, 2026-08-19).** *"sounds
fine to me, until I start adding torpedo max ranges or shit like that."* The captive fish inherits
base `CONFIG.torpedo` behaviour, which runs until impact, so a missed fish crosses the map until it
hits something or the rim. **Accepted as shipped, not an oversight**, and ledgered as the first
thing to revisit if a torpedo max-range mechanic ever arrives. No cap was added.

**Implementation notes that are load-bearing.** `captive` is read LIVE off owner stats, so a vacated
owner reverts the mine to an ordinary contact mine. The launched fish is marked by
`targetX === null && burstRadius > 0` — a combination no other projectile has — so there is **no
side table a reset could leak through**. It routes through `applyMineBlast`, which is why PROP
FOULING rides along automatically per Eric's stacking ruling (A1). The hostile gate reads fleet
aggro LIVE and skips per-hull, so a neutral drone cannot mask the captain behind it.

**STAR-SHELL GUN REACH (R2.15) — the story's one genuinely new cross-system mechanic.** A GUN click
whose target point lies inside a LIVE lit zone **owned by the clicking player** is legal even beyond
`gun.rangeU`. Gun ONLY — never broadside, never torpedo — and own flares ONLY, never an enemy's. It
was implemented twice and agreed only by discipline; it is now ONE shared function in
`shared/src/sim/aim.ts` that both sides call, beside `blockedWater`, which made the same promotion.
**The `LitCircle` type carries no owner and no expiry, so "own flares only" and "live only" are
STRUCTURAL rather than remembered — the type cannot express an enemy or a dead zone.** Both sides
test containment against the MAP-CLAMPED burst point rather than the raw cursor; they differ at the
rim, and that was a real bug in the first draft.

**BARREL FIRES PARALLEL (R2.16).** Eric: *"the shots should fire in parallel lines, not spreading."*
The extra shells fly on parallel tracks at `[DRAFT]` 12u lateral spacing, each bursting at its own
point, with the SAME straddle rule as the broadside. A server/client divergence was closed here too:
`BARREL_FAN_STEP_RAD` is deleted and the server now calls the shared `parallelOffsets`, applying each
vector to BOTH muzzle and target, matching the client shell-for-shell.

---

## Amendment 25 — THE PERCEPTION CARVE-OUT: the server now deliberately emits FALSE blips (ERIC A3 + IMPLEMENTER)

JAMMING BUOY is the first time in this project's history that `perception.observe()` emits a signal
that is **not true**. It is worth its own amendment because the master perception invariant has been
the anti-cheat spine since Story 1.1 and this is the first thing that looks like a breach and is not.

**The ruling (Eric A3).** Jamming denies RADAR ONLY; truesight and LOS are untouched, so the counter
is to sail in and look. It **ADDS false returns rather than deleting real ones** — the real hull
still paints, it is simply one of many candidates. The buoy's OWNER is exempt and sees the truth,
and the buoy is concealed among its own fakes. `[DRAFT]` ~10 fakes live in the 330u circle,
re-scattered each sweep.

**THE FAKES MUST BE SERVER-GENERATED, and this INVERTS the wake-chop precedent.** Chop
(epic-4 amendment 211) is client-side precisely because it carries no information — *"a channel that
carries nothing must not cost wire"*. Jamming's entire purpose is DENYING information, so a modified
client that dropped the fakes would gain a decisive advantage. They are emitted by the server, gated
through the ONE `blipGate` and shaped through the ONE `blipShape`, so they are
**wire-indistinguishable from real blips**. They are deterministic per `(jamSeed, revolution)` off a
server-private decorrelated stream — never `Math.random()`, so tests can reproduce them while a
client, which never learns `jamSeed`, cannot predict them.

**THE DECLARED EXCEPTION COUNT STAYS AT SIX** (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`). **This is not
a seventh, because a fake discloses nothing real.** The invariant is a LEAK rule — nothing outside
sight ∪ this-tick radar paints may appear in a frame — and adding a signal that corresponds to no
ship cannot leak a ship. What the invariant's TESTS asserted, however, was the stronger property
that every blip traces to an actual ship, and that needed an **EXPLICIT, documented carve-out rather
than a quiet edit**:

- `verifyBlip` becomes a **four-arm OR**, each arm an independently re-derived oracle demanding
  byte-level mask equality, with the fakes **RECOMPUTED from the seed by a test-local scatter**
  rather than read back from production code.
- **SOUNDNESS IS PROVEN, NOT ASSERTED:** a forged blip carrying a hidden real ship's TRUE FOOTPRINT
  fails `verifyFrame` with fakes present. The carve-out therefore cannot be used as a laundering
  channel for a real contact.
- **COMPLETENESS PAIRS BY CONSUMPTION.** A review-gate finding (Codex) noted that a fake and a real
  return with byte-identical payloads are indistinguishable — which is harmless, since identical
  payloads carry identical information, and is not catchable by any rule. The REAL hole, found while
  fixing it, is **one blip justifying TWO expected sources**; the oracle now pairs each expected
  source to exactly ONE blip by consumption and forges that case to reject it.

**A modified client learns nothing from any of this.** `blipProvenance.test.ts` pins that the client
cannot tell a fake from a real return, or a relayed one from a direct one.

---

## Amendment 26 — THE CARD FACE IS MINIMAL, THE TOOLTIP CARRIES THE EXPLANATION, AND THE LADDER IS A LOOT-TIER RAMP (TWO ERIC RULINGS, 2026-08-19)

**R2.17 (Eric).** *"I want the card itself to be pretty minimal in the upgrade tab, just the name and
stat change as before (previous -> new) if applicable. But hovering one with the mouse should give a
tooltip explaining the card, so that there are no questions like 'what the fuck does a captive mine
do?'"*

**The face now carries EXACTLY:** the ladder name at its stack position, the lineage marker, the
rarity tag, and — only where the line moves a number — the `current → next` sentence computed through
the existing `effectiveStats` preview diff. `StatLine.note` is DELETED outright, so the six standing
riders leave the card. A verb card (PHOSPHOR, DAZZLE, PROP FOULING, CAPTIVE MINES, GUN BUOY, JAMMING
BUOY) moves no number, so its face is name + tag only. **All 29 lines gained a plain-language
explanation on the tooltip**, stat lines included — a `current → next` number does not tell a new
player what `cooldownScale` or a trip ring IS.

**THE TOOLTIP IS HOVER-ONLY BY RULING**, correcting an earlier orchestrator ruling that demanded a
keyboard path. *"a new player will probably click and hover and read tooltips. an experienced player
knows what they want and will use the shortcut or click faster without reading."* **The shortcut
exists precisely so you can SKIP the reading**; wiring the tooltip into it would put the explanation
back in front of the player who does not want it. The two paths serve different players and must not
be collapsed. (The refit window is **Tab** to open, **1–4** to pick, **5** to heal — verified in
`client/src/input/keyboard.ts`. CLAUDE.md's `CTRL`-based description was STALE and is corrected in
this cycle.)

**SUPERSESSION OF RECORD — epic-4 amendment 47's container-fit law is RE-AIMED, not deleted, and the
escape IS the point.** That ~90-character / ~5-wrapped-line budget exists because Story 2.8's
doctrine text OVERFLOWED THE CARD BOX by 50–97px on the live site. Once the explanation is no longer
inside that box, the budget no longer governs it: **the tooltip may be as long as it needs to answer
Eric's question, and gets its own pin against its own container**, while the pin is re-aimed at what
now sits on the face (the stat sentence). The compression was the reason cards could not answer him
in the first place. `DOCTRINE_TEXT` becomes tooltip copy rather than card copy; Eric's verbatim card
NAMES are unchanged and remain canon.

**THE LINEAGE RAMP IS THE LOOT-TIER CONVENTION (ERIC RULING, 2026-08-19), superseding the same day's
first attempt.** The implementer shipped ladder position as a phosphor INTENSITY ramp, reasoning that
DESIGN.md reserves every tactical hue. Eric: *"These are cards and the meaning of colors can be
different from colors on the map. Don't a lot of games use colors like Green -> Blue -> Purple ->
Red -> Gold for tier/rarity and such?"* **They do, and he is right that the earlier ramp
over-applied a constraint** — those reservations govern THE WATER, where misreading amber-as-armed or
red-as-denied gets you sunk; a refit card is chrome in a modal, a different surface with its own
vocabulary. **Nothing was invented: the five rungs ARE the ratified palette**, which already happens
to be exactly that ladder — phosphor (green), info (blue), storm-readout (purple), denied (red),
amber (gold). **ABSOLUTE, not normalised**: rung II is blue on a 2-copy line and on a 5-copy one, and
a short ladder simply never reaches gold because it has no capstone rung to reach. Still DUAL-CODED
twice — the Roman numeral and the ladder name each state the rung in text, so colour is a fast read
and never the only read. **Flagged rather than hidden:** `denied` and `amber` also carry refusal and
armed state on this same surface; if rung IV ever reads as *"this card is refused"*, that is the
thing to change.

**A process note worth keeping:** the token guard caught hex values written in a COMMENT. It scans
comments deliberately, so a literal cannot hide in prose — the tokens were named instead.

---

## Amendment 27 — THE BATCH-SIM EVIDENCE PASS: what moved, what did not, and what it could not see (MEASURED, 2026-08-19)

This pass discharges the story's own acceptance criterion and **pays the cycle-42 debt** — the last
catalog change shipped explicitly unmeasured and that debt had been ledgered ever since. Full record:
`batch-sim-evidence-7-5-2026-08-19.md`. 380 AFTER matches across five campaigns against a **real
BEFORE tree** (`git archive 9a7d37b`, running its own unmodified harness, because the spend policy
legitimately changed with the catalog and porting the new policy backwards would have measured a
policy that never shipped). Only rows whose aggregation code is byte-identical across both trees are
compared.

**The economy resolves, and by a slightly wider margin.** Zero failures, zero `unresolved` cap-outs,
bot resolution 98 % → **100 %**, gunner `fieldCleared` 200/200, match length p50 −3.5 to −4.2 %
(shorter, and the longest single match shortened by ~100 s in both campaigns). The Story 3.4 endgame
guarantee re-verified: the `endgame` pilot resolves **50/50** with **96 % concluding past the 12:00
endgame ring**. Deleting the gun's damage ladder did NOT lengthen matches, and the reason is picks —
a captain in these matches fits 4.5 boons across a 41-card deck, so a five-copy damage ladder was
almost never stacked deep enough to matter. **The deletions moved the damage guardrail the SAFE way:**
the largest possible single hit vs the lightest class hull widened from 50 to 55 hp, and the largest
possible CLICK fell from 72 % of a Torpedo Boat to **36 %**.

**No card is dead.** All 29 lines appear in at least one class's deck (structural, no simulation
involved) and `NEVER OFFERED: (none)` in all five campaigns. Offer rate spans 45.1 % down to 2.7 %,
entirely explained by copies and class membership.

**THE BATTLESHIP LOST ABOUT A QUARTER, AND THE FIELD GOT FLATTER.** Wins **52 % → 34.6 %** across 130
bot-matches; kills −26 %, damage −26 %, levels −21 %, life −14 %. The loss is concentrated in the
broadside-led **`siege`** profile (kills **−44 %**, damage −35 %), whose whole thesis is standoff at
intel range and whose weight table still buys `intelRange` at 2.4 — but **the broadside no longer
reaches intel range**: every RANGE card widens its gun by 50u and its main weapon by 31.25u, and the
weapon the profile is named after reaches 62.5 % of where its gun reaches. **The profile was never
retuned for the new weapon, so −44 % is an UPPER BOUND on the weapon's own loss** and the instrument
cannot separate the two. The field is flatter than before — 35/21/45 against a BEFORE where one class
took 52 % and the Mine Layer was a 12 % also-ran, the exact complaint cycle 96 recorded — which may
well be the intended trade. **That is Eric's call, not the harness's, and no rebalance was taken.**

**ONE VALUE WAS RETUNED, because it violated Eric's own ratified constraint.** *"You definitely can't
hit a single ship with all the shots from this unless they are close and exposing their broadside to
you."* At SPREAD ×4 + TURRETS ×2 the five shells separated by **2.6–14.1u, below the 30u burst
DIAMETER at every range**, so every burst merged into one crater on ANY hull at ANY aspect out to the
full 537.5u reach — a guaranteed **100 hp point-strike, 80 % of a Torpedo Boat**, exactly the opposite
of the ruling. `[12, 9, 6.5, 4.5, 3]` → **`[12, 10.5, 9, 7.75, 6.5]`**. **The BASE 12° is unchanged
and stays**: the same pass measured it as matching his brief exactly (1 of 3 shells on a broadside-on
battleship at max range, 1 of 3 bow-on at every range). Only the tightening half moved, so SPREAD
still reads *spread → parallel-ish → near the point* while the top rung now **rewards** the close
broadside-on shot instead of removing the need for it.

**Findings recorded and NOT acted on, each because acting would need a ruling:**
- **`barrelSpacingU` 12u is smaller than the 15u burst RADIUS**, so the three bursts always overlap
  and a maxed BARREL click is a single 45 hp hit rather than a 12u-wide pattern. That is why the
  click one-shots a full-health 45 hp small drone **routinely** (168 such kills in the `endgame`
  campaign) — and why the analytic pin's 45 = 45 equality is the ordinary outcome, not a corner case.
  **The class-hull guardrail is untouched: 0 one-tick-from-full class kills in 940.** Whether BARREL
  is a visible spread (needs > 30u) or a damage upgrade that forgives 10–15u of aim error (12u is
  already right) is a design question.
- **PHOSPHOR SHELLS contribute 0.08 % of all damage** (369 hp against 472 000). Not necessarily wrong
  — it is a zone-denial verb, not a damage verb — recorded so nobody has to guess later.
- **Deck lifetime fell 39 %** (72.2 → exactly 44 draws to exhaustion, zero variance) and the
  escalating soft pity now **inverts past dry=3**. `deck.rareWeightPerDryLevel = 0.7` was ratified in
  cycle 39 against a 53–58 card deck and no longer does what it was tuned to do. Real matches rarely
  reach that far, so it is a tail property of the model rather than a live problem.

**What this pass COULD NOT measure, stated plainly because a stated gap is worth more than a
fabricated figure:** the RADAR BUOY in its entirety (see amendment 27); CAPTIVE MINES' lead quality
(it fires and hits — 233/269/155 fish launched — but its hits are indistinguishable from an ordinary
mine blast, both exactly 55 hp, and `DamageEvent` carries no weapon field); star-shell gun reach
(nothing reports whether a click was legalised by a lit zone); PROP FOULING's slow, DAZZLE's sight
halving and HOMING's steering (behaviour changes with no damage signature); and every human-facing
question. Every duration here is a **lower bound** — these pilots are omniscient and far less
cautious than people.

**Harness work, all under `server/scripts/` — no `server/src`, `shared/` or `client/` file touched:**
`catalogMetrics.ts`, `catalogReport.ts` and `balanceProbe.ts` are new, because **the shipped report
had no per-line resolution at all** — a card never offered, never picked, or picked every time was
invisible in every existing row, which is exactly what the AC asked about. Damage is attributed BY
AMOUNT (every source now emits a unique boon-invariant constant, which is itself a consequence of
deleting the three damage ladders); anything unmatched is bucketed and printed, so a future damage
card cannot silently corrupt the attribution. The shipped `first exclusive OFFERED/FITTED` rows read
**0.0 % structurally** once the `exclusive` rarity went extinct, and were replaced by `first doctrine`
rows rather than left to become a silent dead line.

---

## Amendment 28 — OPEN AND UNRULED, carried out of Story 7-5

Recorded here and entered in `deferred-work.md` so they are tracked rather than lost in prose. **None
of these is resolved by this cycle.**

- **THE RADAR BUOY IS ENTIRELY UNMEASURED.** Zero deployments in **2 600 bot-matches**. The bot brain
  has no buoy tactics by design (`ai/tactics.ts` defers them to *"a later agent"*: the buoy is a
  click-placed weapon on the mine's rear sector, not an `actSeq` ability), and the scripted captain
  pilots fire slot 0 only. Relay, jamming density, the autonomous gun, the 20s/30s duty cycle and the
  destructible 50 hp hull are all untested. The Mine Layer's measured numbers are additionally
  DEPRESSED by ~82 picks per 1 000 bot-matches spent on a weapon it never used. **Anything Eric wants
  to know about the radar buoy has to come from play.**
- **BOTS NEVER FIT AN ACQUISITION CARD — 0 of 2 495 offers, and it is a STRUCTURAL POLICY GAP.** An
  acquisition carries its TARGET equipment's category; a profile's weight table only names categories
  its hull already carries; an unnamed category scores `UNLISTED_SCORE = 0.5`, below every real
  weight. So a bot can only take one when the whole hand is unlisted, which the universal lines make
  almost impossible. **~12 % of every bot offer hand is dead to it and no bot ever fields a third
  weapon.** Captains convert acquisitions at 50–60 %, which is the control proving the CARDS are
  fine. This biases every per-class number in the balance read.
- **A buoy attracts ACOUSTIC HOMING torpedoes, including its OWNER'S**, and **your own shells can
  intercept your own buoy.** Both follow from R2.7 making a buoy an ordinary collision subject on
  every ordnance path, and the owner exclusion keying on the SHIP id. Documented in-code, not tuned.
- **A relayed return renders along the OWNER'S ray.** The client's shadow march runs from the local
  hull, so a buoy's around-the-island contact — the exact case the relay exists for — can paint at
  speck intensity for a viewer whose own line to that water is blocked. The DISCLOSURE is correct;
  the PRESENTATION under-serves it.
- **`BuoyView` carries no HP channel**, so a KILLED buoy is indistinguishable from an EXPIRED one on
  the client. Called out in the type's own doc: adding a damage-state channel is a wire decision, not
  an implementation detail.
- **Jamming fakes are not water-filtered**, so a false return can land on an island. Nothing else in
  the return grammar can do that, which makes it a potential tell.
- **`barrelSpacingU` 12u < the 15u burst radius** — see amendment 26; BARREL is currently a damage
  multiplier rather than a visible pattern.
- **R2.19's unlimited captive-torpedo range** stands as accepted, to be revisited only if a torpedo
  max-range mechanic is introduced.
- **R2.21a (a buoy's gun hit aggros nobody) and the gun-buoy-vs-rival-buoy default (it does not
  shoot one)** are orchestrator calls flagged to Eric and open to reversal.

---

## Amendment 29 — THE OWN WRECK FINISHES GOING DOWN: two correct rulings collided and a stale doc comment hid it (ERIC REPORT + RULING, 2026-08-20)

Eric, watching the reveal after his own hull went down: ***"my ship should be sunk, not visible in
full-color motionless in the middle of the map."*** He was looking at a hull frozen at exactly
`sink = 0.3` — tint ≈ `0xDCB3B3`, alpha 0.82, scale 0.955 — parked on the water for the entire
spectate/results period while every hull it had been fighting wore the crimson wreck look.

**NEITHER RULING WAS WRONG. THE GAP BETWEEN THEM WAS.** Epic-5 amendment 21 (Story 5.2) capped the
own hull's settle at `CLIENT_CONFIG.ship.ownSettleMax` = 0.3 and made it **hold at the cap past
founder rather than completing** — correctly, because `sunkTint` has zero green and blue and a Pixi
tint MULTIPLIES, so completing the ramp on a live hull costs a cyan/lime/spring captain the ship they
are still steering and shooting with, and popping to full wreck across the ~½ RTT gap before the
`spec` frame would flash on the way out. Epic-5 amendment 31 (Story 5.3, correction #1) then ruled
that **your own wreck STAYS on screen** through the omniscient reveal, with its callsign plate on it
— also correct, and the reason it was defensible to hide it before was that "the reveal was a curtain
nobody saw through". Put the two together and the hold-at-the-cap, written for a gap measured in
frames, silently became the treatment for a gap measured in the whole results period.

**THE STALE DOC CLAIM IS WHAT HID IT, and that is the transferable lesson.** `ownSettle`'s block
justified the cap with *"this one only tints a view that `renderOwn` does not draw at all while
spectating."* That was TRUE when amendment 21 was written and became FALSE at Story 5.3. Nothing
re-read it, and a reader auditing the death beat would have been told in as many words that the case
could not arise. `renderOwn` (`main.ts`) held the client's ONLY `setSink` call for the own view and
stops running at founder; `renderSpectate` re-projects the wreck's nameplate every frame and never
touched the sprite. The claim is CORRECTED in place rather than deleted, so the next reader sees the
seam instead of a clean-looking comment.

**THE RULING: the own wreck completes to the ONE wreck look the game already has.** `setSink(1)` —
byte-for-byte what every enemy hull gets, per `render/ships.ts`'s own sentence (*"There is one wreck
look and one function that produces it"*). No second own-wreck treatment is minted. Identity in death
is carried by the NAMEPLATE, which Story 5.3 ratified as riding the wreck, and Eric's own epic-5
amendment 32 sentence — *"Slowly fading to black is indication enough that it has sunk"* — names
exactly this ramp.

**THE DURATION IS DERIVED, NOT A FEEL KNOB: 3500 ms.** An enemy hull travels 0 → 1 across
`CONFIG.ship.sinkingWindowMs`; ours travels 0 → cap across the same window and stops. Covering the
remaining `(1 - cap)` at the ENEMY's rate is `sinkingWindowMs * (1 - cap)` = 5000 × 0.7 = **3500 ms**,
so the own hull finishes going down at exactly the canonical rate and the number moves automatically
if either shipped constant does. The continuation STARTS at the cap, so the founder→spectate handover
is continuous — the value at `nowMs === you.sinkingUntil` is exactly `ownSettle`'s terminal value and
cannot pop, however many frames of ½ RTT sit in the seam. Fail-closed keeps the module's stated
direction: a missing window, a NaN clock or a degenerate duration renders the TERMINAL wreck, never a
live-looking hull that is actually gone (`clamp01` passes NaN through unchanged, so EVERY way of
minting one — the subtraction and the division alike — is headed off before the clamp).

**SPECTATE CAN BEGIN BEFORE FOUNDER, AND THE FIRST CUT GOT THAT BACKWARDS (review-gate correction,
caught by both reviewers independently).** The continuation was written as though founder always came
first, and clamped a negative elapsed to zero — which returns the CAP. It does not always come first:
`frames.ts` `spectates()` returns true for **everyone** the instant `phase === 'finished'`, with no
lifecycle test at all, and `match.ts` `holdsForSinkingCaptain()` is bypassed once the safety-net
`finishDeadline` passes. So a **revenge kill in a 1v1** — the ending Story 5.2 calls the entire point
of the sinking window — drops the winner into spectate with seconds of window still to run. Under the
clamp their hull would jump UPWARD from wherever the linear ramp had reached (~0.06 two ticks in) to
the 0.3 cap in one frame, and then sit frozen there until founder: **this cycle's own defect, in
miniature, introduced by the fix for it.** Corrected by handing straight back to `ownSettle` for any
pre-founder instant, which makes the seam continuous IN BOTH DIRECTIONS rather than at one point. The
regression pin was proven to discriminate (reverting the branch fails it), and the accompanying
whole-span sweep carries a written note that it does NOT catch this class — a clamped continuation is
flat, hence smooth, in its own output; the pop is only visible when the two functions are compared.
The lesson is the amendment's own: *"only clock skew can land here"* was a stale premise written in
the same breath as a correction of one.

**IT LATCHES, and that is a budget requirement rather than tidiness.** Amendment 4 records the
omniscient reveal already **BREACHING** its render leg at 11.8 ms against a 10 ms bar, so no unbounded
per-frame work may be added to it. Once the ramp reaches 1 the sprite is at its terminal look and
`setSink` is never called again. **The latch is never RESET, and the amendment says so rather than
claiming the tidy version**: `sinkSettled` is only ever initialised in the per-join `Game` literal and
written true, exactly like its neighbour `visualsSet`, which nothing resets either. It survives a
requeue because `requeue` rebuilds `Game` wholesale, and it cannot go stale within a join because
`state.spectating` is itself a one-way latch — there is no second life after a sinking. If
`spectating` ever becomes resettable, both flags rot together, and the in-code comment carries that
warning. The wreck HULL is likewise seated **once**, at spectate entry, at the authoritative
`ownWreckPose` — which also closes a smaller defect nobody had reported: the hull sat where
PREDICTION last put it while its plate was placed from the last SERVER pose every frame, so the two
could disagree by the whole prediction error, and the reveal's pull-back makes any such gap read as a
callsign floating off its mark. One datum, two consumers. **The seat also had to MAKE the sprite
visible, not merely leave it visible** (second review-gate correction): `renderOwn` holds the only
`gfx.visible = true` in the client, and `renderAlive`'s null-own-pose branch sets it FALSE — reachable
on the last frames before the handover, since a reconnect force-snaps the predictor and drains
`ownBuffer`, and the `P` toggle does the same. Spectator frames carry no `you`, so the pose never
returns and the one-shot never runs again: without that line the wreck is simply ABSENT for the whole
reveal while the plate keeps re-showing its callsign over open water — precisely the failure the
seating exists to prevent.

**WHAT DID NOT MOVE.** `ownSettle` is behaviourally byte-identical (only its doc block changed) and
its hold-at-the-cap pin stays GREEN, with its rationale narrowed to the ½-RTT gap it actually
governs. `CLIENT_CONFIG.ship.ownSettleMax` is untouched — amendment 21 binds it *"may shrink, never
grow"* and this fix needed neither. The enemy settle path (`net/roomBindings.ts`
`presentWreck`/`driveSettle`/`markSunk`) and `render/ships.ts` are untouched. The sinking WINDOW's
look is untouched: mockup F1's DECIDED *"hull stays full personal hue"* row governs the five seconds
you are still fighting, and this change begins at founder. No on-water death register, no new beat,
no key surface — amendment 24's *"the reveal is the backdrop"* holds. No layer restack. **Client
presentation only: no wire field, no server change, no `shared/` change, `PROTOCOL_VERSION` stays
45.**

**LEDGERED AS OPEN FOR ERIC — THE UNRATIFIED ALTERNATIVE.** The ratified mockup
`death-reveal-results-1.html` (F2/F3 legend, row 4) tags the wreck-marker treatment as a **`PROPOSAL`**,
not a decision: *"'Your wreck marked' is decided; the treatment is mine: own hull held at 45% opacity
in personal Cyan (identity persists in death), sink rings continuing at {colors.damage-marker}, last
smoke, callsign plate above. Alternative if too quiet at this zoom: a ring-buoy glyph in Cyan."* That
proposal was never ratified and has never been implemented. This cycle takes the **crimson wreck
look** instead, because implementing the proposal would mint a SECOND wreck look — the thing
`ships.ts` forbids in as many words — and because identity in death is already carried by the plate.
**Eric can reverse this**: if he wants the 45 %-personal-hue treatment, it is a change to the terminal
value this ramp walks toward, not a rewrite, and it would need a ruling on whether a second wreck
look is acceptable. Recorded so the choice is visibly his rather than silently the implementer's.

## Amendment 30 — THE HOME VERSION REGISTER IS THE BARE VERSION (ERIC RULING, 2026-08-20, cycle 118)

*"get rid of the 'RT PROTPTYPE //' on the homepage. Just leave the version."*

The wordmark's third line has read `RT PROTOTYPE // v{version}` since the pre-rebrand menu (the string
is recorded in the UX extract of 2026-07-16, when it lived in `ui/menu.ts`). It now reads `v{version}`
and nothing else. `client/src/ui/home.ts:427` is the ONLY site that composes it.

**This is a COPY ruling and nothing else moved.** The `ver` element keeps its styling byte-for-byte
(`registerCss('hudMicro')`, `color:var(--hc-phosphor)`, `letter-spacing:0.2em`), the wordmark is still
exactly the three children `[mark, tagline, ver]`, and the version VALUE is untouched — it still arrives
as `showHome`'s `version` argument, sourced from `__APP_VERSION__` = the root `package.json` version
that `client/vite.config.ts` single-sources at build time. No layout, layer, hue, or register-scale
change; no wire field; `PROTOCOL_VERSION` unchanged at **45**. Client text only.

**The retirement pin got its own test rather than riding the structure test.** The shipped pin
(`expect(ver.textContent).toContain('RT PROTOTYPE')`) sat inside `wordmark is still exactly
[mark, tagline, ver], style untouched`, under a describe header documenting only the cycle-87 tagline
ruling. Bending it in place would have left this ruling's only guard inside a test whose name and
comments name a DIFFERENT ruling — so a future re-scope of the structure test silently drops it. The
new `version register is the bare version — the RT PROTOTYPE prefix is retired` test carries a dated
comment naming this ruling, asserts the exact rendered string, and matches
`/rt\s*prototype/i` negatively so a case- or spacing-variant of the retired copy cannot drift back.
This follows the file's own established pattern, two tests above, where the `LAST HULL FLOATING WINS`
retirement pin lives in the test that owns ITS ruling.

**Deliberately NOT changed, and both are ledgered in deferred-work.md for Story 7-6** (design & doc
reconciliation): `README.md:1` still titles the build *"Hullcracker — Real-Time Prototype"*, and the
dated UX mockup `mockups/home-class-picker-1.html:309` still renders `RT PROTOTYPE // v0.16.0`. Eric's
ruling was scoped to the homepage; the mockup is a dated record of what the UI looked like in July and
is not a live contract, and rewording settled artifacts alongside a change signal is exactly what the
minimal-design-doc-edits rule forbids. But Epic 7 was rescoped PORTAL LAUNCH -> SELF-PUBLISHED BETA, so
whether this build still calls itself a prototype anywhere is a live release question rather than a
tidy-up — hence the ledger entry rather than silence.

**Environmental note for the next agent, not a defect:** `shared/dist/` is gitignored, and BOTH the
server and client type-checks resolve `@salvo/shared` to it. A fresh worktree therefore fails
`npm run check` with dozens of errors naming `broadside`, `radarBuoy` and `turretMuzzles` — Story 7-5
and cycle-113 symbols that exist in `shared/src` but not in an unbuilt `dist`. The fix is
`npm install && npm run build -w shared`, and it is now recorded in this cycle's spec Verification
section so the next reproducer does not chase stale-artifact noise as if it were a regression.

---
---

## Amendment 31 — INTEL RANGE IS DELETED AND THE EIGHTHS LADDER IS NOW FROZEN (TWO ERIC RULINGS, 2026-08-20)

Eric: *"remove the intel range upgrade cards from the game."* The `intelRange` line — category `intel`,
common ×4, `radarRange` **+50 u per card**, player copy IMPROVED OPTICS → HIGH-GAIN ANTENNA → DIRECTOR
TOWER → CAVITY MAGNETRON — leaves the catalog entirely: **29 → 28 lines**, intel subdeck **9 → 5**, the
universal floor (intel + ship + guns) **25 → 21**, and every hull's deck **41 → 37**. `PROTOCOL_VERSION`
**45 → 46**, because catalog content IS wire contract (`shared/src/index.ts`, `shared/src/sim/boons.ts`)
and the client resolves boon ids FAIL-CLOSED, so the PV join gate is the only desync guard.

**THE CONSEQUENCE IS THE WHOLE FEATURE, AND IT WAS PUT TO ERIC BEFORE ANY CODE MOVED.** `intelRange`
was the ONLY card in the catalog that wrote `stats.radarRange` — not the buoy (`radarBuoy.radarRange`
is the buoy's own flat field), not star shells or dazzle (which scale `sightRange` at read time through
`sightOf`), no hook. So deleting it does not merely remove a card: **it freezes the entire eighths
ladder at its base for every observer, permanently.** Detect 247.5, sight 330, muzzle/smoke 412.5,
farRadar 577.5, radar 660 — one set of numbers, the same for everyone, all match. A maxed build
previously reached radar 860 / sight 430.

**RULING 1 — THE BASE DOES NOT COMPENSATE.** Offered the choice between leaving `CONFIG.vision.radar`
at `SIGHT * 2` = 660 and raising it toward the old mid-stack, Eric took 660. So this is a **pure
removal**: zero-boon play is byte-identical to 0.17.117 in every field, and no combat, sensor, storm or
economy tunable moves. The ceiling is simply gone. Every Story 3.4 pillar pin (radar = 2×sight,
radar ≥ terminal ring radius, sight < terminal ring radius) passes untouched because none of its inputs
moved.

**RULING 2 — THE `intel` CATEGORY SURVIVES.** It now holds exactly ONE line, `intelSweep` ×5 (a rate,
not a range — epic-6 amendment 22 already kept it separate for that reason). `UNIVERSAL_CATEGORIES`
stays `['intel','ship','guns']`, offers still roll three distinct categories, and the `INTEL` label and
`SHIPWIDE_CATEGORIES` are untouched. The alternative — folding `intelSweep` into `ship` and retiring the
category — was offered and declined; it would have left only two universal categories feeding
offer-distinctness for a card nobody asked to move.

**WHAT WAS KEPT ON PURPOSE, AND WHY THE NEXT AGENT MUST NOT "CLEAN IT UP".** Epic-6 amendment 22
anchored the 5/8 muzzle/smoke rung on `me.stats.radarRange` — `muzzleFlashReach(me)` — so the ladder
scaled with the observer's build, and called that *"removing the odd one out"* rather than adding an
exception. **Every observer now resolves that anchor to the same 412.5 u, so the rung is EFFECTIVELY
flat again — but it is reached through the same single derivation seam, not a re-introduced literal.**
The anchor stays. So do the foghorn band divisor and the radar dim ramp. Reverting them to constants
would re-litigate amendment 22's mechanism without a ruling, fork `effectiveStats()` as the sole
derivation path, and cost real work back if a radar card ever lands. **The master perception invariant
still has exactly SIX declared exceptions** (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`) — that count is about
which signal rows bypass the invariant, never about whether a reach is observer-scaled, so nothing about
it moves. Likewise the four post-fold re-pins (`gun.rangeU`, `starShells.rangeU`, `broadside.rangeU`,
`sightRange = radarRange / 2`) stay in BOTH `applyBoonStats` and `clampStats`: they still build base
stats, and only their *"a mid-list fold would leave this stale"* comments needed rewording, since the
thing that could fold is now a future card rather than a shipped one.

**`'radarRange'` STAYS ON `BOON_STAT_PATHS`, UNWRITTEN.** The established shape — `gun.burstRadius`,
`gun.contactDamage`, the seven `<equipment>.reloadMs` paths, `radarBuoy.sweepRpm`,
`kinematics.reverseSpeed` all already sit there with no card behind them — so a future radar line lands
without touching the whitelist. It is added to the `orphaned` list in `shared/src/__tests__/boons.test.ts`,
which is where this project records that fact. It also keeps the injected-def test escape hatch
(`OMNI_BOON`) legal, which matters because several tests legitimately need a widened radar to exercise
something that is NOT the card.

**TESTS WERE RETIRED, NOT ADAPTED** — the style of cycle 93 (`cannonBlast`) and cycle 95 (`mineTrigger`),
so no vestigial assertion survives. Tests whose SUBJECT was the card are gone (the per-observer
intel-range block in `upgrades.test.ts`, the stacking cases in `stats.test.ts`, the broadside stacking
test, the `boonCopy` rows). Tests that merely used the card as a convenient WIDENER kept their subject
and changed their scaffolding — and several never needed the card at all: `foghorn.test.ts` already
pokes `stats.radarRange` directly, `dimMaskLifetime.test.ts` and `hullOverRadar.test.ts` already drive
raw numbers into `setRanges`. One real casualty is named rather than hidden: **the "ladder ordering
holds by ARITHMETIC at every stack level" invariant is now vacuous** — there is only one stack level —
so it is pinned once, at base, instead of across a loop.

**TWO THINGS THAT WOULD HAVE BROKEN LOUDLY AND ARE FIXED HERE, WORTH KNOWING BECAUSE THEY ARE THE SHAPE
OF EVERY FUTURE CARD DELETION:** `server/scripts/batchsim/balanceProbe.ts` derefs
`BOON_CATALOG[id].copies` over a hand-written `universal` id array, so a deleted id is an undefined
deref at runtime, not a type error; and `shared/src/constants.ts`'s bot profile `lines` maps carry
per-card weight keys (`siege.intelRange` 2.4, `forager.intelRange` 2.2) that `bots.test.ts` asserts must
all exist in the catalog. **The two profiles' `cat.intel` appetites were deliberately NOT retuned** —
they now buy sweep RPM only, which is a balance question and not part of a removal; ledgered in
`deferred-work.md`.

**ALSO LEDGERED, NOT FIXED:** the radar dim-mask rebake (the cycle-98 `TextureSource` freeze) had TWO
production triggers and now has ONE — a star-shell dazzle. `spec-radar-dim-mask-render-freeze.md`'s
acceptance criterion and manual QA step are written on *"fit an `intelRange` boon"*, which is no longer
reachable in play; the lifetime guard itself is unchanged and still pinned by tests that drive
`setRanges` numerically.
## Amendment 32 — BOT POLICY SPLITS ONTO TWO AXES (ERIC RULINGS, 2026-08-20, cycle 110)

Story 7-5 finalized the weapons and the 23-line catalog, but the combat bots were only
MECHANICALLY re-pointed at the surviving card ids — no behaviour was ever taught. Measured at the
start of this cycle: `ai/` read **zero** doctrine verbs (all of `mine.captive`, `mine.propFouling`,
`torpedo.homing`, `starShells.dazzle`, `starShells.phosphor`, `radarBuoy.gun`, `radarBuoy.jamming`,
`broadside.spreadRung` were already in scope on `BotSituation.stats` and never accessed), the RADAR
BUOY had no tactic at all, and every acquisition card scored the 0.5 unlisted default so the extra
slot filled only by accident.

### THE RULING (Eric, 2026-08-20)

*"I want the bots to be able to semi-intelligently use the weapons they pick up for the R slot, too.
So perhaps some of these 'profiles' should live on the equipment as well as the ship. Maybe a
combination (what does BS do if it gets mines?). Perhaps a profile might prefer one pickup over
another, but may settle if its the best pick?"*

**TWO AXES.** The SHIP profile (`ai/profiles.ts`) owns temperament: engagement band, target weights,
disengage/heal thresholds, posture, and an APPETITE table. The EQUIPMENT TACTIC (new
`ai/equipment.ts`) owns weapon knowledge — want/solve/reach and every doctrine branch for ONE
equipment id — and **travels with the weapon**. `EQUIPMENT_TACTICS` is a total
`Record<EquipmentId, EquipmentTactic>`, the same completeness gate the server's own
`game/equipment/index.ts` uses: a future equipment cannot ship without a bot tactic.

**WHY THE SPLIT IS THE FIX, not a refactor.** The flat table keyed weapon knowledge by HULL. Because
acquisition cards let ANY hull carry ANY equipment in `SLOT_EXTRA`, that was structurally wrong in
both directions: a Battleship that acquired mines had no idea what a mine was, and `bulwark` — which
carries star shells NATIVELY — shipped with `usesStarShells: false`, i.e. flagged never to fire a
weapon it always had. Capability now comes from the loadout (`chooseShot` walks the bot's ACTUAL
fitted slots through the registry); the profile only says how eager it is.

**TEMPERAMENT MODULATES PROACTIVITY ONLY (ruled).** One mine tactic shared by everyone: `trapper`
lays as a standing plan, `siege` lays only when something is closing. A profile may NOT override
placement geometry, doctrine choice or target selection — a per-(profile × equipment) override table
is the flat model this replaces and is FORBIDDEN. Pinned: two profiles holding the same equipment
place it byte-identically and differ only in eagerness.

**THE WEAPON MAY PULL THE BAND, BOUNDED (ruled).** A fitted weapon that is READY and whose reach lies
inside the hull's band tugs the band's NEAR edge toward that reach, **capped at halfway**, and only
while loaded. So a `siege` Battleship eases in with an acquired torpedo loaded and drifts back out
when the tube empties — and never becomes a `duelist`. One card must not erase a profile's identity.

**PREFER, BUT SETTLE (ruled).** Every profile carries a FULL RANKING over all six acquisition cards,
every entry above the `UNLISTED_SCORE` 0.5 floor, so a bot takes its third-choice pickup rather than
passing out of pickiness. Measured after: every acquisition line is fitted in play (3–13 fits over 30
matches) where the R slot was previously filled only by an all-junk hand.

### A DOCTRINE MAY ADD AN OCCASION, NEVER SILENTLY REMOVE ONE

The cycle found **three** instances of the same defect class, and this is the durable rule they
produce. Each was a doctrine branch written as a REPLACEMENT for the base behaviour rather than an
addition, so BUYING A CARD MADE THE BOT WORSE at a job it already had — which no card in this
catalog does:

1. **The buoy (orchestrator catch).** `jamming` sited only in contact and `gun` only within gun
   reach, so a doctrine holder stopped dropping recon buoys with an empty scope. Both verbs are pure
   ADDS in the sim — a jamming buoy still relays to its owner, and the owner is exempt from its own
   fakes — so recon is now available to every doctrine.
2. **PHOSPHOR (review gate, CONFIRMED by arithmetic).** A non-eager holder waits
   `FLARE_STALE_MS × 2` = **3000ms** before spending a flare, while the phosphor cap refuses any plot
   staler than `litRadius × 0.8 / fastestHullSpeed` = **2933ms**. The window was EMPTY BY 67ms, so
   PHOSPHOR silently deleted the C2 sensor-flare role for `bulwark` and for every acquirer at base
   appetite. It was invisible twice: the blind-vacuum test rows are all EAGER, and every phosphor
   test in the suite used `siege`. The cap is real geometry and wins; reluctance now degrades to the
   eager floor rather than to nothing.
3. **CAPTIVE (review gate, CONFIRMED).** `mineWant` lays astern on `disengage` at any appetite with
   NO target; the captive branch ran its no-target refusal first, so a low-hp trapper fleeing an
   attacker LOST IN FOG — the case a rear-facing trap is most for — laid nothing. Fixed NARROWLY: the
   fleet-only refusal is deliberate and STAYS, because a captive trip is hostile-only and a neutral
   PvE drone genuinely walks over it. Only the no-target case moved.

### THE OMNISCIENT PILOT IS RETIRED (Eric ruling, same day)

*"the old 'omniscient' bot profile we used for development can be retired."* Resolved against what
the name actually denoted: not a bot profile at all, but `batchsim/pilots.ts`'s scripted captains.
The partition Eric ratified after pushback:

- **`gunner` DELETED.** It read `world.ships` to pick and lead targets. Beyond being obsolete since
  Story 6-4, it is structurally incapable of evaluating the intel/counter-intel half of the
  finalized catalog — buoys, jamming, dazzle, intel range — because it never uses a sensor. It also
  carried a 75% rarity bias (`SPEND_TOP_P`) that `catalogReport` already warned readers not to read
  as taste.
- **`pacifist` KEPT**, as a frozen storm-pacing CONTROL, and redocumented as such.
  **Its omniscience was always INERT**: it never targets or fires, so it reads only its own ship
  record, the live ring and the island list — all of which a real client already holds. The argument
  for keeping it is that a control's value IS being frozen: rebuild it as a flag on the combat AI and
  the next bot retune silently moves the storm evidence with it.
- **`endgame`'s LETHAL half DELETED**; the gate survives as a TEST-ONLY BOT behaviour
  (`--bot-engage endgame`), because that instrument's lethal half SHOULD track the real game — the
  opposite of the pacifist case, since it asks whether real combat concludes.
- `pilots.ts` → `controls.ts`, `PILOT_REGISTRY` → `CONTROL_REGISTRY`, `--pilot` → `--control`
  (default `pacifist`, no alias). `pickSpendChoice` moved VERBATIM to `batchsim/spendPolicy.ts`
  because `--deck-only` builds no World at all and depends on it.

### THE BLIND-VACUUM RIG (Eric ruling, same day)

*"we do need one version of each ship (for TESTING ONLY, not for in-game AI opponents) that will take
random upgrades so that we can see how things are performing in a blind vacuum."*

Three test-only profiles in a **separate id space**. `BotProfileId` is DERIVED from
`CONFIG.bots.profiles`, which is exactly the table `ArenaRoom.buildBotFleet` rolls from — so putting
test ids there would deal them to a real human's opponents. `TestProfileId` / `AnyProfileId` keep
them out, `CONFIG.bots.profiles` is untouched, and unreachability is proven by TABLE DISJOINTNESS
rather than by sampling. `--bot-profile` refuses an in-game id.

**CARD PICK ONLY is randomized (ruled):** heal still fires by rule at `healHpFrac`, so damage control
does not become a confound in the survival data. The weighted path stays rng-free and byte-identical
— pinned by a test that hands it a THROWING rng and demands the same answer. The spend rng is a
decorrelated per-bot stream minted at enroll, never `mind.rng`, whose only consumer is aim scatter.

### WHAT DID NOT MOVE

`PROTOCOL_VERSION` stays **43**: `CONFIG.bots` rides `WelcomeMsg.config` but has ZERO readers in
`client/`, the governing precedent being epic-6 amendment 24. No combat constant and no card
magnitude was retuned — this cycle tuned BOT POLICY only. No file under `client/` changed.
`BotWorldPort` widened by exactly ONE boolean (`zoneEndgameReached`), authorized as PARITY: it is
reconstructible client-side from `zoneStartT` + `CONFIG.zone` through the shared `zoneLiveState()`,
and the gate never reads ring geometry (ring centres stay server-private).

### CORRECTION OF RECORD — `forager` wanted CAPTIVE for a reason the game does not contain

`CONFIG.bots.boonWeights.forager.mineCaptive` was **2.4**, with a CONFIG comment claiming captive
"farms without re-positioning". The shipped mechanics contradict it: a captive mine's trip is
HOSTILE-ONLY (`isCaptiveMineHostile`), so a neutral PvE fleet drone walks straight over it, and
captive mines never contact-detonate. CAPTIVE therefore DISARMS the fleet-farming that `forager`
exists to do. Demoted to 0.9 (held-line neutral — not a wanted line), the want moved to `trapper`
(2.4), and the false rationale deleted. This is the same stale-rationale trap the comment block above
it was written to prevent, one ruling later.

### MEASURED (30-match campaigns, deliberately modest per Eric's *"you don't need to do a metric fuckton"*)

- 5437 tests green (shared 768 / server 1549 / client 3120), up from 5392 at baseline. Lint clean.
- Bot-vs-bot, 20 bots × 30 matches, seed 7: **4 of 6 quality bars PASS**. The two failures —
  "bots scoring ≥1 participant kill" 44.8% vs ≥60%, and "storm deaths as a share of deaths" 1.6% vs
  5–20% — **were already failing at Story 6-4** (45.8% and 3.3%) and were diagnosed there as
  questionable bars rather than bot defects. NOT regressions. Land contact IMPROVED, 0.9% → 0.6%.
- The new verbs are live in play where they were structurally impossible before: **655 buoys
  deployed**, 108 captive torpedoes, and `bulwark` fitting star-shell cards it could never use.
- Card ledger: **`NEVER OFFERED: (none)`** and **`OFFERED BUT NEVER FITTED: (none)`** — every one of
  the 29 catalog lines is both offered and fitted under bot policy.

### THE RIG'S FIRST FINDING (measured, NOT acted on — full record `bot-evidence-2026-08-20.md`)

A controlled A/B at MATCHED seed and roster (`--bots 18 --matches 30 --seed 11`), differing only in
spend policy, splits into two claims that must not be conflated:

| class | wins WEIGHTED | wins RANDOM | kills w → r |
|---|---|---|---|
| Torpedo Boat | 15/30 | 5/30 | 1.15 → 0.53 |
| Battleship | 11/30 | 13/30 | 0.90 → 1.26 |
| Mine Layer | 4/30 | 12/30 | 0.68 → 0.92 |

**(a) The Torpedo Boat is the BUILD-SENSITIVE hull** — best with a curated build, worst with a random
one. That is a statement about the HULL and the CATALOG and is **Eric's to rule on**; nothing was
changed for it here.

**(b) The Mine Layer's bots build it WORSE THAN CHANCE**, nearly tripling its win share when its
weight tables are ignored. A profile that underperforms a coin flip is evidence about the WEIGHT
TABLE, not the hull — a BOT-POLICY finding, and the first thing a follow-up should chase.
**Deliberately NOT acted on in this cycle**: retuning `forager`/`trapper` off a single 30-match A/B
is the tune-first-measure-later mistake the rig exists to prevent, and the ruled scope was to teach
behaviour, not to re-balance profiles.

Bounds of honesty on both: one seed pair, 30 matches per arm, and BOT behaviour rather than human —
a person's build is neither weighted-table nor uniform.

### A FOURTH AND FIFTH DOWNGRADE, FOUND BY THE CROSS-MODEL PASS

The Codex arm of the review gate found two defects the in-family Fable pass did not, which is the
argument for running both:

4. **`mineWant` bypassed PROP-FOULING's widened window for a CAPTIVE holder.** `mineWant` hands the
   whole decision to the captive branch the moment `mine.captive` is set, but the two verbs STACK by
   design and the captive torpedo carries the foul. A neutral-appetite layer holding both, facing a
   pursuer closing astern at 450u, laid nothing where fouling ALONE laid.
5. **`alreadyHeld` demoted EVERY held line, not just one-copy ones** — PRE-EXISTING since Story 6-4.
   Its docstring said *"the ONE-COPY line this def names"*; the implementation tested only
   `fitted.includes(id)`. So a bot that bought one `intelRange` scored the next at the held-line 0.9
   instead of its profile's 2.4 and STOPPED CLIMBING the ladder its doctrine rests on — likewise
   `shipCooldown` (×5), `mineBlast` (×4) and every other stackable line. A multi-copy line needs no
   demotion at all, because the deck stops offering it once its copies are spent. Not a regression
   from this cycle, but precisely the failure this cycle exists to fix.

**LEDGERED, NOT BUILT:** Codex also flagged that `enroll()` accepts a `TestProfileId` with no RUNTIME
guard. Containment today is the type split + table disjointness + a structural test, and no
production caller passes one. A runtime guard would require a "test mode" flag, which is itself a new
production surface defending against a caller that does not exist. Recorded as accepted.

### SAME-DAY CORRECTION — ERIC'S PLAYTEST OVERTURNS ONE READING AND ONE WEIGHT

Recorded here rather than left to be rediscovered, because it partly reverses this amendment's own
`forager.mineCaptive` demotion and retracts an orchestrator hypothesis stated above.

**THE HYPOTHESIS IS RETRACTED.** The orchestrator read the ML's 4/30-vs-12/30 result as
`forager` declining the fights that decide matches (`captain: 0.5`). Eric played the hull the same
day and describes that avoidance as the CORRECT play: *"hanging back to avoid getting killed in the
first minute, and then slowly trying to find a PvE fleet to farm on… ML is more of a, hang back and
be safe/strategic sort of class."* **The measurement corroborates HIM, not the hypothesis** — the
weighted ML lives 181.1s against the random ML's 264.0s (+46%), fits 1.97 boons against 2.96 (+50%)
and earns 4.29 levels against 6.58 (+53%). The failure is SURVIVAL, not target choice, and neither ML
profile actually hangs back: `forager` bands at 0.20–0.45R and `trapper` at 0.12–0.35R, the closest
band of any profile in the game.

**THE `mineCaptive` DEMOTION WAS OVER-CORRECTED.** The mechanical fact this amendment records is
still true — a captive mine's trip is hostile-only, so it cannot farm neutral fleet drones — but the
conclusion drawn from it was wrong. Eric ran CAPTIVE MINES and GUN BUOY together early and reports
both as *"REALLY powerful… you just have to be lined up well and prepare."* Captive is not a FARMING
tool, it is a SURVIVAL-AND-PAYOFF tool, which is exactly what a hull whose problem is staying alive
should want. `buoyGun` is likewise named by NEITHER ML table and falls through to a bare category
weight, despite being half of the combo Eric calls a powerhouse.

**RULED AND SCHEDULED AS CYCLE 111** (Eric, 2026-08-20), deliberately NOT folded into this cycle's PR
so its campaign evidence keeps describing the code it shipped: re-band both ML profiles outward and
raise both disengage thresholds; restore `forager.mineCaptive` as a wanted line; give `buoyGun` an
explicit override in both ML tables. Eric's *"lined up well and prepare"* additionally points at the
captive/buoy PLACEMENT tactics being prepared ahead of an engagement rather than sited reactively —
equipment-axis work, not a weight change. Hull and catalog balance stays OUT: *"A lot of this is what
the balance pass is going to be for! But it still needs to play intelligently."* Full record:
`deferred-work.md`, the 2026-08-20 section.

---

## Amendment 33 — THE MINE LAYER HANGS BACK, AND THE CONTROL IS NOT CROSS-CYCLE (ERIC RULINGS, 2026-08-20, cycle 111)

The follow-up amendment 32 scheduled. Cycle 110's blind-vacuum A/B found the ML's bots building and
sailing it WORSE THAN CHANCE (4/30 wins weighted vs 12/30 random) and the orchestrator initially
misread the cause as target choice. Eric played the hull and named it correctly:

> *"My best performance so far was hanging back to avoid getting killed in the first minute, and then
> slowly trying to find a PvE fleet to farm on. I got captive mines and gun buoy pretty early and
> those are actually REALLY powerful weapons, you just have to be lined up well and prepare… It
> wants certain things, and when it gets them it is a powerhouse, it just needs to survive until
> then."*

### THE RULINGS

**BANDS AND THRESHOLDS, ruled verbatim.** `forager` 0.45–0.80R, disengage 0.55, heal 0.60;
`trapper` 0.25–0.50R, disengage 0.45, heal 0.60. Before: `forager` 0.20–0.45 / 0.40 / 0.50 and
`trapper` 0.12–0.35 / 0.35 / 0.50 — **the closest band of any profile in the game, on the hull that
most needs distance.** Neither ML profile had ever actually hung back; both were written as brawlers
with a farming preference. Pinned as literals so a "tuning" drift is a reviewed edit.

**PREPARED PLACEMENT, pulled INTO scope by Eric** over an orchestrator recommendation to defer it. A
mine may be laid with NO target when the posture is safe and the bot's own live-mine count is under
`CONFIG.bots.preparedMineReserve` (3 of `maxLive` 5). The gate is DOCTRINE-SHAPED, not
profile-shaped — eager appetite OR holding `mine.captive` at neutral — because a CONTACT mine needs
something following you while a CAPTIVE mine is a 144u-trip torpedo launcher that fires at the first
hostile into range and therefore works with nobody chasing. That is exactly why it suits a hull that
is hanging back, and why Eric's build worked. Keeping the branch on the doctrine preserves the
two-axis separation: the profile still only says how eager it is.

**THE `mineCaptive` DEMOTION IS REVERSED**, as amendment 29's same-day correction ruled: restored to
2.0 for `forager` (deliberately under `trapper`'s 2.4 signature). `buoyGun` gains an explicit override
in BOTH ML tables (2.0 / 2.2) where it was named by NEITHER and fell through to a bare category
weight, despite being half the combo Eric calls a powerhouse.

**A SHIPPED DEFECT CLOSED ON THE WAY.** No lay — reactive or otherwise — ever consulted
`stats.mine.maxLive`, and `addMine` SILENTLY EVICTS the owner's oldest mine at the cap. Prepared
laying every 15s reload would have demolished the field it had just built; the feature would have
destroyed itself. Own live mines are counted through `MineView.own` — the same data a client
receives, so no port change and no perception widening.

### MEASURED — parity with chance, from well below it

| Mine Layer | weighted | random control | gap |
|---|---|---|---|
| cycle 110 | 181.1s · 4/30 · 1.97 boons | 264.0s · 12/30 · 2.96 boons | 82.9s · 8 wins |
| cycle 111 | **264.4s · 8/30 · 2.89 boons** | 268.1s · 8/30 · 2.62 boons | **3.7s · 0 wins** |

PvE kills rose 3.19 → 4.32 while participant kills edged DOWN 0.68 → 0.62 — it hangs back and farms,
exactly as reported. `forager` is now the longest-lived profile in the game (296.6s).

### THE METHOD CORRECTION — THE CONTROL IS NOT CROSS-CYCLE (durable)

The orchestrator instructed that the random control **must return unchanged** from cycle 110 and that
any movement was a defect. **That instruction was WRONG.** The control did move (ML 12/30 → 8/30), and
it is not a leak: the test-profile rows are byte-identical, but the churn bound and the prepared lay
live in `EQUIPMENT_TACTICS`, which the two-axis design SHARES with every profile carrying that
equipment — and the test rows run every appetite at EAGER, so they pick up prepared laying too.

**THE BLIND-VACUUM RIG'S CONTROL IS STABLE ACROSS CYCLES ONLY FOR PROFILE AND WEIGHT CHANGES. ANY
EQUIPMENT-AXIS CHANGE MOVES BOTH ARMS, SO THE CONTROL MUST BE RE-RUN IN THE SAME CYCLE.** This
cycle's headline uses the within-cycle comparison for that reason. Anyone reaching for the rig again
must re-run its control rather than quoting a prior cycle's.

**Ruled not worth chasing (Eric):** the random arm's ML win shift is ~1.5σ on a binomial at n=30 —
*"its fine. its random. nothing really changed on stats in this time. we know the behavior is an
improvement."*

### THE PROJECT GATE IS FLAKY, AND IT PREDATES THIS WORK (measured)

`client/src/__tests__/radarHeatmap.test.ts` fails intermittently in isolation on a quiet machine:
**1 of 5 runs on cycle-111 code, 3 of 6 runs on cycle-110 code** (`fcfcffe`, before any of this
cycle's changes). Always the same pair of register/intensity assertions. `npm run check` is the
project's stated ship gate and currently has a material chance of failing on a clean tree for reasons
unrelated to the change under test — which trains re-run-until-green, the habit by which a real
regression eventually rides through. NOT fixed here (client rendering, untouched by this cycle);
ledgered in `deferred-work.md` as a real defect rather than left as folklore.

### WHAT DID NOT MOVE

`PROTOCOL_VERSION` **43**. No `client/` file. No hull stat, card magnitude or combat constant. The
four non-ML profiles, `CONFIG.bots.profiles` and all three test-only rows are untouched. 5446 tests
(shared 768 / server 1558 / client 3120).

### CARRIED FORWARD

`trapper` is still the weak profile — survival improved (228.1s) but it kills least of any profile
(0.41) and finished **0% alive**. The re-band let it live; it has not made it dangerous. The
unverified "trapper under-buys the gun" hypothesis from cycle 110 remains open and may dissolve
once the balance pass moves mine numbers. Match length rose 29% in the weighted arm because the ML
stops dying early — a real pacing consequence worth feeling on the water.

## Amendment 34 — A NAME IS NEVER OBSCURED BY TERRAIN, BUT THE RETICLE READS OVER THE NAME (ERIC RULINGS, 2026-08-21, cycle 123)

> *"in game, names need to appear above all players and in front of islands, not behind. they should
> never be obscured by terrain."*

...and then, on being shown the first draft of the resulting stack:

> *"i think i should be able to see aiming reticles over it. Just not terrain."*

`createStage` mounted its five roots `worldRoot, plateRoot, fogSprite, chartRoot, hudRoot`, so
`plateRoot` was the SECOND thing on the stage and sat underneath **everything** in `chartRoot` —
including `map`, whose island bodies and contour bands are filled at `alpha: 1`
(`client/src/render/map.ts:152-155`), and `ship`. Every callsign was therefore painted over by any
island it crossed and by every hull silhouette on the water. This is not a tuning question: a label
that a hill can delete is not a label.

### THE SECOND RULING IS THE ONE THAT SHAPED THE FEATURE

The obvious fix — lift `plateRoot` above `chartRoot` — satisfies the first sentence and overshoots
the second: it carries plates above `aim`, `burstFx` and `sweep` too. The first draft did exactly
that and **ledgered the overshoot as an accepted consequence**, arguing that a screen-space container
cannot be threaded between two camera-transformed layers without splitting `chartRoot` in two. Eric
read the ledger entry and declined the trade. He was right to: the overshoot silently widened epic-5
amendment 22's own rule (*"above the returns, below the reticle and the burst rings, which are the
marks you aim and read damage with and must never be occluded"*) from hulls to labels, and a label
has a **weaker** claim over a reticle than a hull does, not a stronger one.

**So the nameplate container is now a CHART LAYER, `plate`, seated directly between `ship` and
`aim`** — the same seat `ship` itself won last cycle, one rung up. `CHART_LAYER_ORDER` reads
`… blip, ship, plate, aim, burstFx, sweep`, and that single array index carries **both** halves of
the ruling: above `map` and `ship` (never obscured by terrain, above all players), below
`aim`/`burstFx`/`sweep` (the reticle, the aim preview, the burst rings and the sweep read over a
name). The `plateRoot` stage ROOT is retired.

### A SCREEN-SPACE LAYER INSIDE A CAMERA-TRANSFORMED ROOT — THE ONE UNUSUAL THING HERE

Plates are placed in raw screen pixels by `camera.worldToScreen` and hold a constant 14px at any
zoom precisely so the text never scales or tilts (`render/nameplates.ts`), so they cannot inherit
`chartRoot`'s transform. `applyCamera` therefore writes the **exact inverse** of that transform onto
this one container: Pixi composes `parent ∘ child` as `position + scale · p` at each level, so a
child point `p` lands at `px + zoom·(−px/zoom + p/zoom) = p`. The plate layer's z-position lives in
the chart stack while its contents live in screen space.

**The inverse belongs in `applyCamera` and nowhere else**, for exactly the reason the forward
transform does — that function is already documented as *"THE one place that transform is written"*,
and a caller who applied the camera without the inverse would leave every callsign drifting against
the world. It is written once per frame at the one site, and both call sites (`main.ts`'s render
callback and `render/ambient.ts`'s home scene) go through it.

**The alternative was REJECTED, not overlooked:** splitting `chartRoot` into two camera-transformed
roots to thread a screen-space root between them costs a fourth root, a fourth declared array, a
wider `applyCamera`, and a split of a ratified order array — all to express a stacking that one
array index already says.

### THE LIFT'S BILL IS THE SAME ONE EPIC-5 AMENDMENT 22 PAID, AND IT IS PAID THE SAME WAY

Being under the fog gave a plate the composite's feathered sight hole **for free**: a callsign dimmed
as its hull neared the edge of the bubble, which is precisely what DESIGN.md's Nameplate row means by
*"they fade in/out with truesight resolution"*. `chartRoot` is above `fogSprite`, so wherever inside
it the plate sits, that dimming disappears. The plate's alpha is now `fader × softness` — the SAME
per-frame `HullSoftness` value `ContactViews.render` already computes once per hull and hands to the
hull silhouette and the aggro bracket. One softness per hull per frame, evaluated at the same world
point by all three consumers, so a hull and its own label can never disagree about how far into the
feather they are. `hullSightSoftness` itself did not move: it is still the fog texture's own two
constants (`HOLE_FEATHER_START`, `FOG_FILL_ALPHA`), still observer-scaled, still exempted inside an
owned star-shell zone by `main.ts hullSoftnessFor`. What is new is only that a plate consumes it.

The own-ship plate stays at alpha `1` (`updateOwnPlate`, untouched): the observer is at distance 0,
so its softness is 1 by construction and multiplying it in would buy nothing.

### THE ROOT ORDER IS NOW DECLARED DATA, WHICH CLOSES A NAMED DEFERRED-WORK ENTRY

`deferred-work.md` carried *"THE STAGE'S TOP-LEVEL LAYER ORDER IS NOT ASSERTABLE, WHICH LEAVES THE
REVEAL'S 'HIDE, NEVER FADE' RULE UNPINNED"* — the three child orders were exported arrays with a
build-failing completeness check while the ROOT order was an inline `addChild` argument list inside a
function that needs a live WebGL context. **Retiring the `plateRoot` root is exactly the class of
change that gap left unguarded**, so the array is declared rather than the call merely edited.
`createStage` now ITERATES the exported `STAGE_ROOT_ORDER` (`worldRoot, fogSprite, chartRoot,
hudRoot`) to build and mount the roots — the array IS the order, not a comment about it — and
`EVERY_ROOT_PLACED`, keyed off `Exclude<keyof Stage, 'app' | 'layers'>`, turns "someone added a root
and forgot the array" into a compile error, exactly as `EVERY_LAYER_PLACED` already does one level
down. The entry is marked RESOLVED.

### THE THREE TRAPS

1. **The feather must ride the plate, or the rim fade is silently lost.** Nothing fails, nothing
   throws — a callsign simply reads at full strength right to the boundary of the sight bubble and
   then vanishes, which is a harder edge than the one the fog draws and breaks a shipped DESIGN.md
   promise. If a future refactor drops the `softness` argument from `drivePlate`, that is what
   regresses.
2. **The inverse transform must be written EVERY frame the camera is.** It is one function, so the
   only way to break this is to add a third `applyCamera`-like path or to start writing the camera
   transform somewhere else. A frame that moved the chart without the plate leaves every callsign
   sliding across the water.
3. **`hudRoot` must stay on top.** Plates gained the chart layer, NOT the HUD. The chrome bar,
   hotbar, vitals, storm vignette and foghorn chevrons must all still draw over a floating callsign;
   a foghorn chevron in particular lives at the viewport edge where plates congregate at low zoom.

### A RATIFIED PIN WAS UPDATED, DELIBERATELY

`hullOverRadar.test.ts` asserted `at('aim') === at('ship') + 1` under the heading *"leaves it
directly between the two, so nothing slipped in on either side"*. Something deliberately did. The
RULE that file exists to protect — a hull never occludes the marks you aim and read damage with — is
unchanged and still pinned there; only the adjacency moved. **The seat has exactly ONE owner** — a
first pass asserted `plate === ship + 1` in BOTH files and the review gate flagged it, because two
files asserting one fact is how a pin ends up half-updated. `nameplatesAboveTerrain.test.ts` owns the
plate's seat and also re-pins `ship === blip + 1` so the hull lift's own guarantee cannot drift out
from under it; `hullOverRadar.test.ts` keeps only what it is about and says so in a comment where the
deleted assertion stood.

### A STALE RATIONALE WAS REWRITTEN RATHER THAN LEFT TO ROT

`enterSpectateVisuals`'s *"THE FOG IS HIDDEN, NEVER FADED"* paragraph justified itself by an
ASYMMETRY — plates under the fog, hulls above it, so a fade would dim every callsign while leaving
the hulls at full brightness. That asymmetry is gone. **The conclusion stands and the behaviour is
byte-identical** (`Fog.setVisible(false)`, never an alpha); its premise is now the simpler one: the
reveal's whole job is to take the fog OFF, and a half-transparent composite would leave a uniform
grey wash over the ocean the results modal is read against. The same false premise was restated in
`fog.test.ts`'s header and in `render/stage.ts`'s, and both were corrected in the same pass. A comment
asserting a stacking that no longer exists is the next agent's trap.


### TWO CONSEQUENCES THE REVIEW GATE SURFACED, BOTH LEDGERED RATHER THAN ABSORBED

**1. A NAME NOW PAINTS OVER A RADAR RETURN.** `plate` sits above `blip` in
`CHART_LAYER_ORDER`, because it sits above `ship` and `ship` has sat above `blip` since
epic-5 amendment 22. Under the old root order the plate was beneath the ENTIRE chart, so
phosphor returns painted over callsigns; now callsigns paint over returns. Eric ruled on
TERRAIN and on RETICLES; he did not rule on radar paint, and this follows from the seat
rather than from a decision. It is named here so it is a known consequence rather than a
side effect, and it composes with the near-range dim mask (epic-4 amendment 181): a
callsign at close range now reads over returns that are themselves displayed at 20%. If it
reads as clutter on a dense scope, the fix is a seat between `blip` and `ship`, which
would cost the *"above all players"* half of the ruling — so it is Eric's call, not a
tuning knob.

**2. THE FEATHER IS SAMPLED AT THE HULL, WHICH IS NOT THE SAME AS WHAT THE FOG DID.** The
first draft of this cycle claimed the plate's alpha reproduced the composite's dimming
*"numerically"*. It does not, and the review measured why: `plateScreenY` draws a plate
ABOVE its hull's bounding circle — `polygonMaxRadius(hullSilhouette('battleship'))` is
62.29u, plus `padPx` 8 at a typical 0.73 alive zoom, so roughly **73u** in world terms —
against a feather band of only `sight × (1 − HOLE_FEATHER_START)` = **82.5u**. The fog is a
SCREEN-space texture, so it faded a plate by the PLATE's position; sampling at the hull is
therefore a real behavioural difference of up to 89% of the band, and it flips sign with
bearing. **Sampling at the hull is nonetheless the choice**, because reproducing the
composite exactly would put a full-strength callsign over a hull the fog is already eating
whenever the contact is north of you, and the reverse south of you — a 4× brightness split
between two contacts at equal range with no in-fiction cause. A label should fade with the
thing it labels, which is what `contacts.ts`'s one-softness-per-hull contract already said.
The overclaim was removed from `stage.ts`, `contacts.ts` and the test titles rather than
the behaviour being changed to match it. **`updateOwnPlate`'s hard-coded alpha 1 is a
second derivation of the same rule** and was left alone: the observer is at distance 0, so
`hullSightSoftness(0, sight)` is exactly 1, and the spec forbade touching it.

### A DEFECT IN THIS CYCLE'S OWN GUARD, FOUND AT THE GATE

The degenerate-zoom guard originally wrote the forward transform and THEN reset the plate to
identity. That bought **nothing**: `plate` is a CHILD of `chart`, so a NaN already committed
to `chart.scale` composes straight through an identity child and the plates land at NaN
anyway (at `zoom = 0` they collapse onto a single point). The guard now runs BEFORE anything
is written and returns, leaving the whole camera at its last good state — strictly less code
for a guarantee that is actually met. Its test moved with it: it asserts the COMPOSED
round-trip through Pixi's own `getGlobalPosition()`, not `plate.scale`, because the broken
version passed a `plate.scale === 1` assertion while failing the property that assertion was
standing in for. `camera.zoom` is also read ONCE now — it is a recomputing getter, and the
old code gated the branch on a different read from the one it had already committed to
`chart.position`.
### WHAT DID NOT MOVE

`PROTOCOL_VERSION` **47**. Client-only, presentation-only: no `CONFIG` value, no gameplay tunable, no
wire field, no perception rule, and **no change to what the server discloses** — every plate is drawn
from a `Contact` the client already legitimately holds, exactly as amendment 22 established for the
hulls (*"the fog was selling the reveal, never enforcing it"*). Also untouched: which hulls get a
plate, plate text, colour, latch discipline, `NAME_MAX`, `DRONE_PLATE_TEXT`, `plateScreenY` geometry,
`updateOwnPlate`, `WORLD_LAYER_ORDER`, `HUD_LAYER_ORDER`, and the relative order of every other chart
layer. `render/ambient.ts` shares `layers.map` and `layers.ship` on the same stage but adds NOTHING
to the plate layer, so the home scene renders no plates and the reorder cannot affect it (confirmed,
not changed).

### NOT VERIFIED BY EYE

No browser session this cycle — the change is pinned by
`client/src/__tests__/nameplatesAboveTerrain.test.ts` (which round-trips the inverse transform at
0.26x through 1.5x, under shake, and proves it degrades to identity on a zero or non-finite zoom) and
by `npm run check` at 5,555 tests. The specific things worth a human look: whether a callsign now
reads cleanly against the hypsometric contour bands it draws over (it is 14px mono text with no scrim
— DESIGN.md sanctions `card-scrim` as the fallback if it does not), and whether the plate crowd at
the omniscient reveal's ~0.26x framing is worse now that terrain no longer hides any of it — the
mockup's own legend already flagged all-hull nameplates as possible CLUTTER at that zoom, with
*"killer + wreck only"* recorded as its fallback.

## Amendment 35 — THE ARMOR ROW (ERIC RULING, 2026-08-21, cycle 124)

> *"on ship select, change 'toughness' to 'armor' so the text fits better."*

A COPY ruling with a measurable cause. The class card's middle pip row was labelled
`TOUGHNESS`, and it did not fit: the pip grid's label column is a FIXED 88px
(`grid-template-columns: 88px 1fr`), the face is mono, and the label carries its own
0.16em track on top of the 14px hud-micro register — so the label's width is exactly
`chars × (size × advance + tracking)`, and `TOUGHNESS` came to **96.4px in an 88px cell**.
`ARMOR` is 53.5px. `TURNING`, now the longest of the three, is 75.0px.

**The column was NOT shrunk to match**, deliberately: it was never the thing at fault, and
narrowing it would re-arm the same trap for whatever label somebody adds next.

**INTERNAL NAMING IS UNTOUCHED**, following the KILL LEADER precedent (Story 4.6,
amendments 222-227) verbatim: `CLIENT_CONFIG.home.pip.toughness` keeps its key, the
`{base: 200, step: 50}` anchor ladder is byte-identical, `pipFill` still reads
`spec.hp`, and every fill is unchanged (TB 4/2/4 · BS 2/4/2 · ML 3/3/3). Nothing about
what the row MEASURES moved — only the word above it. `shared/`'s own comments still say
"toughness ladder" and that is correct: the ladder is the internal object, the label is the
copy.

**TWO CONSTANTS WERE PROMOTED so the fit could be pinned rather than asserted.**
`PIP_LABEL_COL_PX` (88) and `PIP_LABEL_TRACKING_EM` (0.16) were literals inside a CSS
string; they are now exported and interpolated into that same string, so
`__tests__/classSelect.test.ts` measures against the values the grid actually uses instead
of re-typing them. The measurement itself reuses `refitCardFit`'s `monoTextWidth` — the
same mono model epic-4 amendment 47's container-fit law already uses for the refit card —
so the project has ONE text-metric model and not a second one growing beside it.

**The pin is proven non-vacuous IN THE SUITE**, not just by hand: one case bounds every pip
label of every hull at `≤ PIP_LABEL_COL_PX`, and the next asserts that the RETIRED label
exceeded it while `TURNING` clears it with room. A future row that does not fit fails at
`npm run check` rather than at Eric's eye, which is the whole point — this defect shipped
because nothing measured it.

`PROTOCOL_VERSION` unchanged at **47**. Client-only, copy-and-pin only: no `CONFIG` value,
no gameplay tunable, no wire field, no perception rule, no layout geometry.

## Amendment 36 — THE COLOR HOIST READS AS A WHEEL (ERIC RULING, 2026-08-21, cycle 124)

> *"and while you're at it, organize the colors by hue or something."*

The swatch row walked `PLAYER_HUES` in raw index order. It now walks it in ASCENDING HUE
ANGLE, via a pure `hueSortedIndices(hues)` derived from the hex values at render time.

**THE LOAD-BEARING HALF IS WHAT DID NOT MOVE.** A wheel index is IDENTITY: the server
assigns it at join, it rides `PlayerMeta.color` on the wire, and both sides map it back to a
hex through the same-ordered tables — `REGATTA_HUES`' own doc calls that order *"the single
source of truth both sides share"*. Reordering the ARRAY would repaint every player in the
game and break that agreement. **Only the order the row is WALKED in changed.**
`makeSwatch` still binds the true index, `swatches` is keyed BY index rather than by DOM
position, and a test asserts each rendered swatch still picks its own hue (`aria-label` is
`hue ${idx + 1}` — the true index — and clicking position 3 selects `order[3]`, not 3).

**DERIVED, NOT HAND-LISTED**, so it cannot drift: retune a palette hex and the row re-sorts
itself. It also behaves correctly under the colorblind assist, which swaps `PLAYER_HUES`
wholesale for 8 repeated families — those now GROUP rather than interleave, and the sort is
stable so equal hues keep wheel order.

### THE HONEST FINDING: HUE WAS NOT THE PROBLEM, AND THE REAL ONE IS NOT MINE TO FIX

Measured before changing anything, because the wheel looked suspiciously deliberate — and it
is. `REGATTA_HUES` was **already hue-monotonic** apart from two inversions no eye can
resolve: cobalt 233.0° before periwinkle 230.9°, and orchid 293.4° before fuchsia 289.9°.
The sort fixes both, and that is the entire mechanical effect of this amendment: **two
adjacent swaps out of twenty.**

So the scatter Eric is reacting to is **LIGHTNESS, not hue**. Across the wheel it zigzags
neighbour to neighbour — 65%, 50%, 33%, 55%, 42%, 58%, 33%, 59%, 50%, 34%, 72%, 45%, 66%,
79%, 71%, 49%, 65%, 65%, 39%, 76% — for a **mean neighbour luminance jump of 0.241** on a
0–1 scale (max 0.428). A row whose hue is perfectly ordered still reads as noise when every
other chip is half as bright as the one beside it.

**That was NOT fixed, deliberately.** Smoothing it means re-tuning DESIGN.md's ratified
Regatta hexes — twelve of which the palette's own comment marks as used VERBATIM and never
to be recomputed, because they sit at ~0.451 value rather than a naive 0.45. That is a
design decision and an Eric call, so it is ledgered in `deferred-work.md` with the
measurements rather than absorbed. **Anyone tempted to "finish the job" by sorting the row
by LIGHTNESS instead should not**: that destroys hue grouping, which is the thing actually
asked for.

`PROTOCOL_VERSION` unchanged at **47**. Client-only, presentation-only: no palette value, no
wheel order, no wire field, no assignment rule.
