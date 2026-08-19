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
