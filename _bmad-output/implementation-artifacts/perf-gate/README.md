# Story 7.1 — Performance & Load Pass: the audit record

Cycle 103 (0.17.103) · 2026-08-18 · `PROTOCOL_VERSION` unchanged at 40 · client-only

**The NFR1 whole-frame verdict has been obtained for the first time in the project's
history. Live play PASSES with 10.0-11.0 ms of headroom; the omniscient reveal BREACHES the
render leg at 11.8 ms against 10 ms.** NFR2 passes at roughly a third of its budget. One
real defect was found and fixed on the way, and it was not the one three retrospectives
were worried about.

**Every number below was re-taken after the review gate.** The first draft of the
instrument was wrong in two ways that both flattered the result — it timed only half the
frame, and it measured the reveal at the wrong framing. Both are described under
"corrections" so the next reader can see what changed and why.

---

## The reference device

Read off the machine at run time (`perfLib.mjs` → `os` + `sysctl`), not typed in, so a run
on other hardware cannot silently inherit this stamp:

| | |
|---|---|
| Model | **MacBook Pro 16,1** (2019) |
| CPU | Intel Core **i7-9750H** @ 2.60 GHz — 12 logical cores |
| Memory | 32 GB |
| GPU | **AMD Radeon Pro 5300M** (discrete) + Intel UHD 630 (integrated) — switchable |
| OS | Darwin 25.4.0 |
| Panel | Retina; the client renders at `devicePixelRatio` **2** (3200×1800 backing store) |

The record stamps `isRatifiedReferenceDevice` so a run elsewhere is still a measurement but
is not mistaken for *the bar*.

---

## NFR1 — the frame budget

Budget: **16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms.**

Basis: the **perf build** (`vite build --mode perf`), served as static files, driven
**headful**, dpr 2, 1600×900, staged NFR1 population (20 contestants + the 48-hull peak PvE
fleet = 68 hulls, in-flight ordnance, all shipped effects), 12 s window per framing, **GPU
not forced**. Data: `nfr1-frame-budget.json`.

| Framing | frame p95 | sim | render (scene-graph + draw) | headroom | dropped | verdict |
|---|---|---|---|---|---|---|
| alive 0.5× | 6.6 ms | 0.1 ms | **6.5** (3.9 + 2.8) | 10.0 ms | 0 / 720 | **PASS** |
| alive 1.0× | 5.7 ms | 0.1 ms | **5.7** (2.9 + 3.0) | 10.9 ms | 0 / 720 | **PASS** |
| alive 1.5× | 5.6 ms | 0.1 ms | **5.6** (2.9 + 3.1) | 11.0 ms | 0 / 720 | **PASS** |
| omniscient reveal | 11.8 ms | 0.1 ms | **11.8** (9.1 + 2.9) | 4.8 ms | 0 / 720 | **FAIL — render** |

**Live play passes every leg** at every zoom, with a measured 60 FPS and **zero dropped
frames**, on the fully populated reference scenario. Simulation runs at ~3 % of its 3 ms
allowance — 0.1 ms against 3 — so the sim half of the budget is not a live concern.

**The omniscient reveal breaches the render leg** (11.8 ms against 10 ms). Two things
qualify that, and neither excuses it:

- **The frame still holds.** Total is 11.8 ms inside a 16.6 ms budget, headroom 4.8 ms, and
  the measured cadence is a locked 16.7 ms with **zero dropped frames**. There is no
  player-visible stutter here; what is breached is the ratified *allocation* of the frame,
  not 60 FPS.
- **It is the framing, not the roster.** Re-run at the same framing with the 20-hull
  readability population instead of 68, it still costs **11.3 ms** (scene-graph 8.9 ms).
  Data: `nfr1-frame-budget-readability-subset.json`.
  So the cost is whole-disc drawing, essentially independent of how many ships are afloat.

**What is NOT claimed: an attribution.** The cost is CPU-side scene-graph work (9.1 of the
11.8 ms), and the map layer is already cached — `MapChart.update` re-strokes only on a
meaningful zoom change, so this is not a per-frame terrain redraw. Naming the responsible
system needs per-subsystem timing, which does not exist anywhere in the client. Ledgered
rather than guessed.

### The integrated-hardware stress point (recorded, not a gate)

Forced onto the integrated UHD 630, the same build fails everywhere — alive framings 16–20 ms
per frame with cadence p50 66.9–83.4 ms (~12–15 FPS), and the reveal at 29.4 ms with headroom
−12.8 ms. Data: `nfr1-frame-budget-gpu-low.json`. NFR1 as amended pins the bar to the
reference MacBook and explicitly retired the low-end device, so this sits **outside** the
ratified bar and is recorded rather than treated as a breach. **Flagged for Eric as a
beta-scope question**, not silently accepted.

---

## The defect this found, and the fix

**`powerPreference` was never set, so the game could be parked on the integrated GPU.**

Pixi defaults a WebGL context to `powerPreference: 'default'` (`GlContextSystem`), and
`render/stage.ts`'s `app.init()` never overrode it. On a machine with switchable graphics
the browser is then free to choose the low-power adapter — and on this reference MacBook it
did. Measured on the **home screen** of the shipped build (`homeCadence.mjs`), same bytes,
same pixels, only the adapter differing:

| adapter | frame interval p50 | implied |
|---|---|---|
| Intel UHD 630 (integrated) | **64.9 ms** | ~15 FPS |
| AMD Radeon Pro 5300M (discrete) | **16.7 ms** | ~60 FPS |

The fix is one option in `client/src/render/stage.ts` — `powerPreference: 'high-performance'`
— and it is verified end to end: with **no** GPU flag forced, the shipped build now lands on
the discrete adapter and the home screen holds 16.7 ms p50 / 18.5 ms p95. Every NFR1 number
in the table above was likewise taken unforced.

It is a hint, not a guarantee, and nothing depends on it: a machine with no discrete GPU
keeps the one it has. The cost is battery on dual-GPU laptops — the correct trade for a
real-time game.

---

## The reframing: it is fill rate, not entities

Three consecutive retrospectives worried that entity growth (radar shadows, wakes, chop, a
2800 u ocean, 63 fleet hulls, 20-hull bot lobbies) had gone unmeasured. **It is not where the
risk was.** Three controls, each taken on this device:

1. **Population does not matter.** On the integrated GPU the NFR1 population (68 hulls) and
   the readability population (20 hulls) cost the same — 67.2 ms vs 66.7 ms per frame. The
   same holds at the reveal framing on the discrete GPU: 11.3 ms for 20 hulls against 11.8 ms for 68.
2. **Pixels do.** The same scene at dpr 1 (1.44 M px) held 16.7 ms where dpr 2 (5.76 M px)
   took 67 ms, with a half-viewport dpr-2 point (2.88 M px) at 49.3 ms in between.
3. **The staged scene is exonerated.** The **home screen** of the shipped build — no match,
   no harness, just the ambient scene — showed the identical ~65 ms on the integrated GPU.
   Baseline per-pixel composite, not anything the battle adds.

Consequence for whoever picks up the integrated-hardware question: **pooling, batching and
decay caps cannot move this number.** Overdraw and effective resolution are the levers.

---

## NFR2 — the load budget

Budget: **cold load → interactive home under ~10 s**, fonts not blocking first paint.
Measured against the **shipped** `client/dist` (not the perf build), cold cache every run,
`cache-control: no-store`, interactive defined as `#main-menu button` present. Data:
`nfr2-cold-load.json`; the pre-fix run is `nfr2-cold-load-before.json`.

| profile | FCP | interactive home | budget |
|---|---|---|---|
| residential 24 Mbps / 30 ms RTT | 1 264 ms | **3 076 ms** | ok (31 % of budget) |
| residential, **font CDN blocked** | 836 ms | **2 688 ms** | ok |
| unthrottled | 412 ms | 1 816 ms | ok |

Bundle: **982 kB on disk, 309 kB gzipped**, across 9 JS files — a 737 kB main chunk plus
eight Pixi sub-chunks. (An earlier draft of this record called it "one chunk"; that was the
main chunk's size mistaken for the whole build.)

**"Fonts do not block first paint" is demonstrated, not argued.** Rather than inferring it
from overlapping timings, the middle profile *blocks* `fonts.googleapis.com` and
`fonts.gstatic.com` outright: first paint and interactive home are unaffected. Two changes
support it — `client/index.html` loads the font stylesheet via
`rel="preload" … onload="this.rel='stylesheet'"`, and `createStage()` races the font wait
against `CLIENT_CONFIG.boot.fontWaitMs` (1500 ms) so `app.init()` can never be held hostage
by a third-party CDN.

**Honest note: that fix did not move the measured number**, and run-to-run variance
(2.3–3.1 s across runs on the same build) is larger than any change it made. The font CDN
was never the bottleneck at this connection speed. The change is still correct — it removes
a third-party render-blocking dependency and it is what makes the blocked profile pass — but
no improvement is claimed from it.

**Not measured, deliberately:** ad, analytics and consent script cost. None of it exists yet
(Stories 7.2 / 7.4). This run establishes the budget they must fit inside: roughly **7 s** of
headroom on the throttled profile.

---

## Corrections made at the review gate

Both were caught by adversarial review of the first draft, and both had flattered the result.

1. **The frame was timed half-way.** `app/loop.ts:14-16` records that our ticker listener
   runs at `UPDATE_PRIORITY.NORMAL` while **Pixi's renderer sits at LOW** — a separate
   callback afterwards. Timing only our own callbacks measured the scene-graph update and
   excluded every batch, draw call, filter, mask and full-screen composite. The evidence of
   the flaw was in the draft's own output: an integrated run reported a three-leg **PASS**
   (render 6.9 ms, headroom 9.5 ms) on a machine whose measured cadence was 66.9 ms and 156
   dropped frames. The harness now brackets the whole ticker (`HIGH` … `UTILITY`) and reports
   `render + draw` as NFR1's render leg. A trustworthy cadence can now also **veto** the
   budget arithmetic.
2. **The reveal was measured at the wrong framing.** The live path calls
   `camera.resetUserZoom()` immediately before `beginReveal()`; the staged path did not. The
   capture runs framings in order with the reveal last, so the alive 1.5× zoom was still
   composed in and the reveal was measured **1.5× tighter than any player sees** — the map
   running off all four edges when the framing exists to fit the ocean *with* margin. Fixed,
   and the record now carries `composedZoom` (0.1531) beside `userZoom` so the framing is
   visible rather than inferred. Cost went 5.6 ms → 11.8 ms, which is how the breach above
   surfaced at all.

Also corrected: the cadence trust flag keyed off the **median**, so a genuine 30 FPS was
reported as "untrustworthy" — hiding bad news behind what reads like a clean run. It now
keys off the interval **floor**. And the "60 FPS sustains" test was a bare `p95 ≤ 18 ms`,
which failed runs that dropped **zero** frames; it now uses the harness's own dropped-frame
definition.

---

## Reproducing it

```
npm run build                                   # the shipped artifact
npm run build:perf -w client                    # production pipeline + the instrument
node client/scripts/perfCapture.mjs             # NFR1, headful (the ratified run)
node client/scripts/loadCapture.mjs             # NFR2, cold cache, throttled
node client/scripts/homeCadence.mjs             # validity control, shipped build, no harness
node client/scripts/readabilityCapture.mjs --verify-bundle   # the shipped bundle stays clean
```

Knobs, all defaulting to the ratified configuration: `HC_GPU=high|low`, `HC_DPR`,
`HC_VIEWPORT=WxH`, `HC_FRAMINGS`, `HC_PROFILE`, `HC_DIST`. **Any off-default knob changes the
output filename**, so a variant run cannot overwrite the ratified record — an earlier draft
wrote one fixed name and the evidence had to be hand-renamed, which is exactly how a record
stops matching its own description.

## Caveats on the record

- The two GPU rows are **one machine's** switchable pair, not a survey of hardware.
- The reveal is measured with the camera arrived (motion scale 0), not mid-ease.
- The staged scene paints far hulls on a derived sweep stride rather than every tick; painting
  all 50 every tick is ~80× what a 15 rpm sweep can produce and would manufacture a breach
  nobody could provoke.
- **The NFR1 population sits inside a ~580 u radius on a ~1500 u map** — the scene's radial
  band was sized for Story 4.8's 19 contacts and was not widened for 68. Disclosed because
  it shapes the number: the hulls cluster nearer the centre than a real 20-captain match
  would spread them.
- `render` and `draw` are both CPU-side. Neither is GPU execution time, which no browser API
  exposes; the cadence is what observes the GPU.
