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

**MacBook Pro 16,1 (2019) · Intel Core i7-9750H @ 2.60 GHz, 6 cores / 12 threads · 32 GB ·
AMD Radeon Pro 5300M (discrete) + Intel UHD 630 (integrated), switchable · macOS Darwin
25.4.0 · Retina panel, client renders at `devicePixelRatio` 2.**

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
minification, identical folded-away dev branches, differing from the shipped artifact by one
define, written to a separate `client/dist-perf`. **The shipped `client/dist` is unchanged and
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
| Intel UHD 630 (integrated) | **50.8 ms** | ~20 FPS |
| AMD Radeon Pro 5300M (discrete) | **16.7 ms** | ~60 FPS |

Fixed by setting `powerPreference: 'high-performance'`, verified end to end: after the change,
with **no** GPU flag forced, the shipped build's home screen went 50.8 ms → 16.7 ms p50
(max 17.7 ms).

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

## Amendment 4 — NFR1 PASSES on the discrete GPU; the integrated case is OPEN (Eric question)

**The verdict, taken on the perf build, headful, at dpr 2, in the fully populated reference
scenario (20 contestants + the 48-hull peak PvE fleet + in-flight ordnance + all shipped
effects = 68 hulls), against 16.6 ms = sim ≤ 3 + render ≤ 10 + headroom ≥ 3.6:**

| framing | sim p95 | render p95 | headroom | long frames | verdict |
|---|---|---|---|---|---|
| alive 0.5× | 0.1 ms | 3.8 ms | 12.7 ms | 0 | 60 FPS sustains |
| alive 1.0× | 0.1 ms | 3.0 ms | 13.5 ms | 2 | 60 FPS sustains |
| alive 1.5× | 0.1 ms | 2.7 ms | 13.8 ms | 0 | 60 FPS sustains |
| omniscient reveal | 0.1 ms | 5.6 ms | 10.9 ms | 0 | 60 FPS sustains |

Every leg passes in every framing. **The omniscient reveal — the ledger's "largest
unquantified risk in the project" — costs 5.6 ms and holds a locked 60 FPS.** Simulation
runs at ~3 % of its 3 ms allowance.

**OPEN, NEEDS ERIC — the integrated-hardware case.** Forced onto the UHD 630 the same build in
the same scenario does not hold 60 FPS: p50 66.8–83.6 ms (~12–15 FPS), and the reveal breaches
render (14.3 ms) and headroom (2.1 ms). This is neither a regression nor a failure of
amendment 3's fix — it is the honest answer for a player whose machine has **no discrete GPU
to ask for**, and a large share of laptops are exactly that. NFR1 as amended pins the bar to
the reference MacBook and explicitly retires the low-end device, so this is **outside the
ratified bar** and is recorded rather than treated as a breach. The beta-scope question Eric
owns: does integrated-only hardware need a supported path (a resolution cap, a reduced-effects
mode) or is it out of scope for beta? Evidence:
`perf-gate/nfr1-frame-budget-integrated-stress.json`.

---

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

## Amendment 7 — NFR2 passes at a quarter of budget; the font fix claims no improvement (MEASURED)

Against the **shipped** `client/dist`, cold cache every run, interactive defined as
`#main-menu button` present: **2 310 ms** to interactive home on a throttled residential
profile (24 Mbps / 30 ms RTT) against the ~10 s budget, FCP 948 ms. Bundle 959.1 kB on disk,
**301.8 kB gzipped**, one main chunk.

**"Fonts do not block first paint" is demonstrated by experiment, not inferred from
timings**: a profile that *blocks* `fonts.googleapis.com` and `fonts.gstatic.com` outright
reaches first paint at 824 ms and interactive home at 2 306 ms — unchanged. Supported by two
changes: the font stylesheet loads via `rel="preload" … onload="this.rel='stylesheet'"`, and
`createStage()` races the font wait against `CLIENT_CONFIG.boot.fontWaitMs` (1500 ms) so
`app.init()` cannot be held hostage by a third-party CDN.

**Recorded honestly: that fix did not move the measured number** (2 359 ms before, 2 310 ms
after — inside the ±~350 ms run-to-run variance observed). The font CDN was never the
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
