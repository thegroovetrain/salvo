# Release Gate — Story 7-8 (cycle 131, 0.17.131)

Date: 2026-08-27 · Tree: `worktree-dev-auto-7-8-release-gate` off `development` (cycle 130, PV 49)
Spec: `spec-7-8-the-release-gate.md` · Rulings: epic-7 amendments 45–46

**Verdict: the automatable gate is GREEN. What remains before the beta link goes out is the
manual matrix below — all of it yours, none of it code.**

## AC-by-AC evidence

| Story 7.8 AC leg | Status | Evidence |
|---|---|---|
| Nothing debug ships — `P` toggle | **CLOSED** | Binding + handler DEV-gated (`keyboard.ts`, `main.ts`); `NETCODE:` literal absent from dist (grep runs INSIDE the client build now, plant-proven non-vacuous); pressed `P` live in a production-posture match — no banner, no console output |
| Nothing debug ships — dead-strip check wired | **CLOSED** | `npm run build` → `verify-bundle` PASS (5 tokens); a planted token fails the build with exit 1 |
| Nothing debug ships — `HC_DEV_OPTIONS` | **verify on Render** | Code-gated as always; confirm the env var is absent on the `hullcracker` service (manual matrix) |
| `loadTest.mjs` BUILT and run | **CLOSED** | `server/scripts/loadTest.mjs` (new): 44-socket spike → 40-seat queue cohorts + 2 solo arenas = 4 rooms / 80 hulls, ≥60 s of real 20 Hz input traffic; tick p95 **2.5–2.7 ms** vs the 40 ms bar across three independent runs; every connection accounted for; evidence JSON in `perf-gate/loadtest-selfboot-2026-08-27.json`. The staging/deployed spike is **STRUCK by Eric** (amendment 46) — deployed mode exists in the harness but is nobody's obligation |
| Solo-create cost vector RULED | **CLOSED** | Eric ruled **per-IP create throttle** (amendment 45): 6 admitted creates / IP / rolling 60 s at the matchmake door, before any room is minted; pure policy module + adapter, 25 tests, regression test discriminates (guard-revert fails 4 tests); env-tunable `HC_SOLO_CREATE_LIMIT` (0 = off, harness self-boot) |
| `npm run check` green | **CLOSED** | Three consecutive green runs (exit 0): 784 shared + 1727 server + 3238 client. Both known flakes fixed this cycle (radarHeatmap per-file timeout; map budget 500→1500 ms with rationale) — the gate is a trustworthy signal again |
| `PROTOCOL_VERSION` consistent | **CLOSED** | 49, unchanged; single source `shared/src/index.ts` |
| Browsers: Chrome/Edge/Firefox/Safari | **PARTIAL** | Chromium verified headless (below). Edge/Firefox/Safari are the manual matrix |
| 1366×768 floor viewport | **CLOSED (Chromium)** | Screenshots: home (corner anatomy intact, liveness register bottom-left), class select (ARMOR fits, hue-sorted wheel), in-match HUD (chrome bar, hotbar, helm, hull readout — nothing clipped) |
| Full pipeline manual run on production | **YOURS** | The ad break exists only in production; manual matrix |
| ≤720p liveness-block collision re-derived | **CLOSED — was stale** | Already fixed on this tree: `home.ts` `makeLiveness` at `bottom:22px` ("IT MOVED, AND THE REASON IS A MEASUREMENT"). Eric confirmed from memory; verified in code; ledger entry closes |

## Also shipped under the hardening sweep

- **ESC listener leak** (`/privacy`, `/how-to-play`): `renderPage` now self-disposes on `pagehide`
  (bfcache-safe: `persisted` pages are left intact), destroy idempotent, replace semantics
  deliberately preserved — the ledgered premise ("double-mount stacks roots") was stale.
- **GPC honoured** (Eric ruling, amendment 45): `navigator.globalPrivacyControl === true` →
  consent denied before and regardless of any grant, all four Google signals, nothing persisted
  (turning GPC off restores the player's own stored choice). Policy sentence added (amendment 46).
- **Review gate** (Fable adversarial + Codex cross-model): Fable verdict BUILD-ON-IT; both models
  confirmed one loadTest assertion gap (fixed: `boarded >= expectedSeats`); Codex's
  `x-client-ip`/`x-real-ip` fallback proposal REJECTED (client-forgeable channels covering no
  real deployment — on Render the edge always appends XFF; locally fail-open is the accepted
  posture). Fable's top finding accepted: the rightmost-XFF model is now OBSERVABLE — the
  throttle logs the header shape (`room.soloThrottleShape`), so one glance at Render logs after
  the first staging/production solo create verifies the one-hop assumption empirically.

## Named residuals (accepted, not defects)

1. **Shared-NAT starvation**: a neighbor behind your NAT making 6 admitted solo creates/min
   holds the bucket at capacity; the queue door is never throttled. Inherent to per-IP limits.
2. **Local/no-proxy self-host**: with no XFF header the throttle fails OPEN (one logged warning).
   Moot on Render.
3. **Settings PRIVACY row under GPC** snaps back to OFF with no explainer — the honest state;
   any disabled-row copy is an open Eric item (amendment 46.3).
4. **A later Google-CMP `consent update` can re-grant Google's own signals** client-side; our
   funnel dispatch stays suppressed. Google's CMP honours GPC for applicable US states itself.
5. **loadTest self-boot measures harness+server on one machine** — bias is upward (pessimistic),
   the safe direction for a gate.
6. **`server/scripts/*.mjs` is outside the ESLint config** (only client scripts are covered) —
   pre-existing gap, flagged for a future config widening.

## Open flags (not gate scope — pre-existing, unruled)

- Integrated-GPU hardware does not hold 60 FPS (Story 7-1 finding; fill-rate bound; needs Eric).
- `healthCheckPath` undeclared on both Render services (cycle-127 defer).
- Stale `HC_RADAR_*` env vars live on the production service (removal triggers a redeploy).
- `/metrics` and `/liveness` are public JSON (by design; no auth).
- H5 Games Ads application still pending (external); beta can launch display-unit-only.

## THE MANUAL MATRIX — what stays with Eric

1. **QA cycles 128–131 on staging** (they are un-merged to `main`): play a SOLO VS AI match on
   https://hullcracker-dev.onrender.com — XP assist split, per-level auto-heal, broadside arcs,
   and this cycle's hardening are all there and only there.
2. **Browser matrix**: one match (or at minimum home → match entry → HUD) each on Edge, Firefox,
   Safari, current versions. Chromium/Chrome is covered by this report.
3. **Production pipeline after merge**: home → queue → match → death → **ad break** → requeue on
   https://hullcracker.io/ — the analytics/ads modules never run on staging, so this is the one
   flow that must be smoked in production (CLAUDE.md's standing blind-spot rule).
4. **Render dashboard checks** (two minutes): `HC_DEV_OPTIONS` absent on `hullcracker`;
   after the first staging solo create, read the `room.soloThrottleShape` log line and confirm
   `entries` ≥ 1 and `rightmost` is a plausible client address (the throttle's trust model,
   verified empirically).
5. **The merge itself**: `development` → `main` when staging QA satisfies you (merge commit, not
   squash — the flow in CLAUDE.md). Render auto-deploys production from `main`.

## Load-test invocations (for whenever wanted)

- Local: `node server/scripts/loadTest.mjs`
- Deployed (capability, not obligation): `HC_LOAD_TARGET=https://hullcracker-dev.onrender.com HC_STAGING_KEY=<key> node server/scripts/loadTest.mjs`
