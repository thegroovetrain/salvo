# Story 7.1 — Performance & Load Pass: the audit record

Cycle 103 (0.17.103) · 2026-08-18 · `PROTOCOL_VERSION` unchanged at 40 · client-only

**The NFR1 whole-frame verdict has been obtained for the first time in the project's
history, and it PASSES with 10.9–13.8 ms of headroom.** The NFR2 cold-load verdict also
passes, at roughly a quarter of its budget. One real defect was found and fixed on the way,
and it was not the one three retrospectives were worried about.

---

## The reference device

Read off the machine rather than typed in, so the bar is reproducible by someone other than
Eric (this closes the open ledger item asking for the model/year stamp):

| | |
|---|---|
| Model | **MacBook Pro 16,1** (2019) |
| CPU | Intel Core **i7-9750H** @ 2.60 GHz — 6 cores / 12 threads |
| Memory | 32 GB |
| GPU | **AMD Radeon Pro 5300M** (discrete) + Intel UHD 630 (integrated) — switchable |
| OS | macOS (Darwin 25.4.0) |
| Panel | Retina; the client renders at `devicePixelRatio` 2 |

---

## NFR1 — the frame budget

Budget: **16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms.**

Basis: the **perf build** (`vite build --mode perf` — the identical production pipeline and
minification, one extra define), served as static files, driven **headful** at 1600×900 at
**devicePixelRatio 2**, staging the NFR1 reference population (20 contestants + the 48-hull
peak PvE fleet = 68 hulls, in-flight ordnance, all shipped effects). 12 s measurement window
per framing. Full data: `nfr1-frame-budget.json` (= `nfr1-frame-budget-discrete.json`).

| Framing | sim p95 | render p95 | headroom | cadence p50 / p95 | long frames | verdict |
|---|---|---|---|---|---|---|
| alive 0.5× | 0.1 ms | 3.8 ms | 12.7 ms | 16.7 / 17.5 ms | 0 | **60 FPS sustains** |
| alive 1.0× | 0.1 ms | 3.0 ms | 13.5 ms | 16.7 / 17.6 ms | 2 | **60 FPS sustains** |
| alive 1.5× | 0.1 ms | 2.7 ms | 13.8 ms | 16.7 / 17.3 ms | 0 | **60 FPS sustains** |
| omniscient reveal | 0.1 ms | 5.6 ms | 10.9 ms | 16.7 / 17.6 ms | 0 | **60 FPS sustains** |

**Every framing passes every leg.** Notably the omniscient reveal — flagged in the ledger as
"the largest unquantified risk in the project", because it draws every island coastline and
contour band on the disc at once — costs 5.6 ms and holds a locked 60 FPS.

**The simulation is nowhere near its budget:** 0.1 ms against 3 ms, i.e. ~3 % of its
allowance, across a 68-hull scene. Three epics of anxiety about entity growth were misplaced
— see below.

---

## The defect this found, and the fix

**`powerPreference` was never set, so the game could be parked on the integrated GPU.**

Pixi defaults a WebGL context to `powerPreference: 'default'` (`GlContextSystem`), and
`render/stage.ts`'s `app.init()` never overrode it. On a machine with switchable graphics the
browser is then free to choose the low-power adapter to save battery — and on this reference
MacBook it did. Measured on the **home screen** of the shipped build, same bytes, same
pixels, only the adapter differing:

| adapter | frame interval p50 | implied |
|---|---|---|
| Intel UHD 630 (integrated) | 50.8 ms | ~20 FPS |
| AMD Radeon Pro 5300M (discrete) | 16.7 ms | ~60 FPS |

The fix is one option in `client/src/render/stage.ts` — `powerPreference: 'high-performance'`
— and it is verified end to end: after the change, with **no** GPU flag forced, the shipped
build's home screen went **50.8 ms → 16.7 ms (p50), max 17.7 ms**, and the full NFR1 table
above was then taken with nothing forced.

It is a hint, not a guarantee, and nothing depends on it: a machine with no discrete GPU
keeps the one it has. The cost is battery on dual-GPU laptops, which is the correct trade for
a real-time game.

### The integrated-hardware stress point (recorded, not a gate)

Forced onto the integrated UHD 630, the same build in the same scenario does **not** hold 60
FPS — p50 66.8–83.6 ms (~12–15 FPS), and the omniscient reveal breaches both render (14.3 ms)
and headroom (2.1 ms). Data: `nfr1-frame-budget-integrated-stress.json`. This is not a
regression and not a failure of the fix; it is the honest answer for a player whose machine
has no discrete GPU to ask for, and a large share of laptops are exactly that. **Flagged for
Eric as a beta-scope question, not silently accepted** — see the amendments file.

---

## The reframing: it is fill rate, not entities

Three consecutive retrospectives worried that entity growth (radar shadows, wakes, chop, a
2800 u ocean, 63 fleet hulls, 20-hull bot lobbies) had gone unmeasured. **It is not where the
risk was.** Three controls, each taken on this device:

1. **Population does not matter.** At dpr 2 on the integrated GPU, the NFR1 population (68
   hulls, 704 scene nodes) and the far lighter readability population (20 hulls, 582 nodes)
   cost the **same**: 67.2 ms vs 66.7 ms per frame.
2. **Pixels do.** The same scene at dpr 1 (1.44 M px) held 16.7 ms; at dpr 2 (5.76 M px) it
   took 67 ms. Halving the viewport at dpr 2 (2.88 M px) landed between, at 49.3 ms.
3. **The staged scene is exonerated.** The **home screen** of the shipped build — no match,
   no harness, just the ambient scene — showed the identical 50.8 ms at dpr 2. The cost is
   baseline per-pixel composite, not anything the battle adds.

The CPU was idle throughout: 7 ms of callback work inside a 67 ms frame. **A cost-only
benchmark could never have seen any of this**, which is the argument for the headful basis.

---

## NFR2 — the load budget

Budget: **cold load → interactive home under ~10 s**, fonts not blocking first paint.
Measured against the **shipped** `client/dist` (not the perf build), cold cache every run,
`cache-control: no-store`, interactive defined as `#main-menu button` being present. Full
data: `nfr2-cold-load.json`; the pre-fix run is `nfr2-cold-load-before.json`.

| profile | FCP | interactive home | budget |
|---|---|---|---|
| residential 24 Mbps / 30 ms RTT | 948 ms | **2 310 ms** | ok (23 % of budget) |
| residential, **font CDN blocked** | 824 ms | **2 306 ms** | ok |
| unthrottled | 420 ms | 1 970 ms | ok |

Bundle: **959.1 kB on disk, 301.8 kB gzipped**, one main chunk.

**"Fonts do not block first paint" is demonstrated, not argued.** Rather than inferring it
from overlapping timings, the middle profile *blocks* `fonts.googleapis.com` and
`fonts.gstatic.com` outright: first paint and interactive home are unchanged. Two changes
support that — `client/index.html` now loads the font stylesheet via
`rel="preload" … onload="this.rel='stylesheet'"`, and `createStage()` races the font wait
against `CLIENT_CONFIG.boot.fontWaitMs` (1500 ms) so `app.init()` can never be held hostage
by a third-party CDN.

**Honest note on that fix: it did not move the measured number.** Before it, the throttled
run reached interactive home in 2 359 ms; after, 2 310 ms — inside run-to-run variance
(±~350 ms observed). The font CDN was never the bottleneck at this connection speed. The
change is still correct — it removes a third-party render-blocking dependency and is what
makes the fonts-blocked profile pass — but no improvement is being claimed from it.

**Not measured, and deliberately so:** ad, analytics and consent script cost. None of them
exist yet (Stories 7.2 / 7.4). This run establishes the budget they must fit inside: roughly
**7.7 s of headroom** on the throttled profile.

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
`HC_VIEWPORT=WxH`, `HC_FRAMINGS`, `HC_PROFILE`, `HC_DIST`.

## What the instrument refuses to do

`PresentStats.vsyncTrusted` reports whether a real display drove the cadence, and the capture
records a **refusal** rather than a number when it did not. The flag is keyed off the
*fastest* intervals (the display's capability), never the median (the app's achieved rate) —
the first draft keyed it off the median, which meant a genuine 30 FPS run was reported as
"untrustworthy" and the bad news vanished behind a flag that reads like a clean run. It
failed open, in the one direction that matters. `FrameStats` still carries **no `fps` field**,
per the 2026-08-11 ruling, and a type-level test now stops that compiling.

## Caveats on the record

- The two GPU rows are **one machine's** switchable pair, not a survey of hardware.
- The reveal framing is measured with the camera arrived (motion scale 0), not mid-ease.
- The staged scene paints far hulls on a derived sweep stride rather than every tick; painting
  all 50 every tick would be ~80× what a 15 rpm sweep can produce and would have manufactured
  a breach nobody could provoke. `HC_PROFILE` plus that one constant is where to flip it.
- `nfr1-frame-budget.json` is a copy of the discrete run; both named files are the originals.
