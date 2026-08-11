# Ocean-currents research — benchmark & validation harnesses

Reproduces every measured figure in
`../technical-realistic-ocean-currents-in-hullcracker-research-2026-08-11.md`.

Standalone Node scripts — no build, no deps. They copy `shared/src/sim/noise.ts`'s
`perlin`/`fbm` **verbatim** and `silhouette.ts`'s `closestPointOnPolygon`
arithmetic (`Math.sqrt`, never `Math.hypot`) so they measure the project's real
primitives rather than a stand-in.

```
node curlbench.mjs    # per-sample + per-tick cost, bake cost/memory
node validate2.mjs    # coastal tangency, divergence, tactical calibration
node validate3.mjs    # bake VELOCITY vs bake POTENTIAL head-to-head
```

**Harness validity check:** `curlbench.mjs` measures perlin at ~16.8 ns/sample
against the 17.1 ns figure recorded in `shared/src/sim/noise.ts` (−1.7%).

Headline results (node v22.19.0, x64):

| Measurement | Result |
|---|---|
| Baked potential sample | 43.17 ns |
| Per tick (52 samples) | 2.2 µs = 0.005% of the 50 ms budget |
| Memory, 128² potential lattice | 64 KB/room |
| Divergence, potential-bake | 5.78×10⁻¹⁶ (vs 9.36×10⁻⁴ velocity-bake) |
| Coastal tangency @1 u offshore | mean 0.026, 0/128 samples flowing shoreward |

**Caveat:** these use a synthetic concave "hook" island, not real `generateMap`
output. Re-measure against generated coastlines in Phase 0.
