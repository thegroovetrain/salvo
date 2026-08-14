---
title: 'A different ocean every load — home scene variety, and the off-scope defect it exposed'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_revision: '1cad7a0'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/project-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** Cycle 84 rebuilt the home backdrop as a real slice of the game, but on ONE fixed ocean — the same islands, the same formation, every visit forever. Eric asked for a different scene each time, and priced it: option **B**, meaning randomise per load AND fix the seed-dependent defect first rather than shipping it 1 load in 8.

**Approach:** Roll both seeds per page load (with `?homeseed=<n>` and a logged seed so any scene stays reproducible), and make the scene's properties true of ANY ocean rather than of the shipped one — measured over a sample of random maps, with the sweep kept as a real test.

## Boundaries & Constraints

**Always:**
- Client-only. No `shared/` or `server/` change, no wire change, no `PROTOCOL_VERSION` bump.
- `Math.random` is legal in the render shell (the seeded-RNG law binds SIM code); the WORLD BUILD stays a pure function of its seed, so a scene is always reproducible from one integer.
- Randomising costs reproducibility, so it must be bought back: the seed is logged and `?homeseed=<n>` rebuilds any scene. The darkening was tuned by eye against captures — a menu nobody can rebuild cannot be tuned or debugged that way again.
- The GROUNDING clause is safety-critical and may not be weakened to serve range-keeping. Any range term must compose from INSIDE the escape cone.
- Every seed-dependent property must be proven over a SAMPLE of oceans, on seeds that are NOT the ones the fix was tuned against.

**Block If:**
- Keeping hulls on-scope cannot be done without weakening the coast-escape clause.
- Any fix requires a `shared/` or `server/` change.

**Never:**
- No change to the combat/storm/HUD boundary on the menu (cycle 84's `Never` list stands).
- No reroll-until-pretty gate (option C) — it hides a router weakness instead of fixing it.
- No design-doc edits in-story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh load | no query string | A different ocean and formation than the previous load; seed logged | — |
| Reproduce a scene | `?homeseed=604729` | Byte-identical scene to the one that logged that seed | — |
| Hostile/absent `location` | no/garbage query | Random scene; boot never throws | Caught, falls back to random |
| Garbage seed | `?homeseed=abc` / negative | Ignored, random scene | Validated, silently ignored |
| Any random ocean | 20 seeds x 50s of scene time | No hull ever ashore; no rival ever past base radar range | Test fails naming the exact seed |
| Placement | any seed | Every hull starts with more than its own half-length of coast clearance | Test fails naming the seed |

</intent-contract>

## Code Map

- `client/src/render/ambient.ts` — `pickSceneSeeds()` (new): `?homeseed=<n>` or random, scene seed DERIVED from the map seed so one integer reproduces everything; logs the seed.
- `client/src/render/ambientScene.ts` — `avoidCoast` radii now carry the hull's half-length; `leashed()` (new) rotates an escape heading homeward inside the escape cone.
- `client/src/config.ts` — `anchorClearU` DERIVED from the outer band; outer bands pulled in; `leashStartFrac` / `leashMaxRad`; `placementTries` 48 -> 160.
- `client/src/__tests__/ambient.test.ts` — the 20-ocean sweep, with an explicit timeout and out-of-loop assertions.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/config.ts` -- derive `anchorClearU` from the formation radius, pull the outer bands in, add the leash knobs -- the anchor cleared 180u while the formation orbits to 528u, so it was placed onto coastlines by construction.
- [x] `client/src/render/ambientScene.ts` -- hull-relative avoid radii + the escape-cone leash -- keeps hulls on-scope without touching the grounding clause.
- [x] `client/src/render/ambient.ts` -- per-load seeds, `?homeseed=<n>`, seed logging -- variety without losing reproducibility.
- [x] `client/src/__tests__/ambient.test.ts` -- the 20-ocean sweep -- the licence for randomising at all.
- [x] `VERSION`, `package.json`, both trackers, `deferred-work.md` -- cycle 86 / 0.17.86; the off-scope ledger entry closed as RESOLVED.

**Acceptance Criteria:**
- Given two consecutive loads, when the home page renders, then the ocean, island layout and formation differ, and each load logs a seed that rebuilds it.
- Given `?homeseed=<n>`, when the page loads, then the scene is identical to the one that logged `n`.
- Given 20 random oceans at 50s of scene time each, when the sweep runs, then no hull is ever ashore and no rival ever exceeds base radar range.
- Given the PRE-FIX config, when the sweep runs, then it FAILS and names the offending seed — the test is proven in both directions.
- Given `npm run check`, then lint, all three type-checks and the full suite pass.

## Design Notes

**The cause was not where the ledger guessed.** The prior deferred entry blamed band arithmetic (528 + 109 against 660 = 23u of headroom). The measurement said otherwise: every failing ocean had anchor sea room under 300u and every ocean with 315u or more was clean. The formation was being anchored onto coastlines, and the coast-escape clause — which correctly refuses to steer into land — walks a hull ALONG a shore and outward. Giving the formation room it actually needs removed the mechanism rather than fighting it.

**Two cheap fixes were measured and rejected**, and that is why the leash is shaped the way it is: an unclamped inward spring made things WORSE (6 bad oceans of 40 against 5), because a hull yanked inward drives into the coast it was clearing and re-enters the hard clause more often. Tightening bands alone barely moved it and pushed the worst range up. The leash therefore biases WITHIN the escape cone (at most 55 deg, only past 72% of radar range), so a hull under it still turns away from the rock.

**Measured:** 60 random oceans — zero grounding, zero off-scope, worst range 550u of 660u, 100u of coast clearance to spare. Empty-frame check over 60 more: nearest island to the anchor p50 670u, max 1000u, against a visible half-width of ~1173u, so terrain is always in shot.

## Verification

**Commands:**
- `npm run check` -- 0 lint errors, three clean type-checks, **4456 tests** (741 / 1148 / 2567).

**Manual checks:**
- Three consecutive loads screenshotted at 1366x768: three different oceans, seeds logged (582523951, 791918103, 1598554658).
- Live join smoked: clean match start (HUD, hotbar, own hull, sweep), zero console errors.
