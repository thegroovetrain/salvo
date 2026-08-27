---
title: 'Story 7-8: The Release Gate'
type: 'chore'
created: '2026-08-27'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
warnings: ['multiple-goals', 'oversized']
---

<intent-contract>

## Intent

**Problem:** The beta link cannot go out until the final hardening sweep runs, and four of its
items are real construction, not checks: the `P` netcode toggle ships in production (NFR17
violation, named by the AC), `loadTest.mjs` does not exist (third epic to assume it), the NFR17
dead-strip check is wired into nothing, and the capture-phase ESC listener leaks on both static
pages. Two more make the gate itself untrustworthy: `radarHeatmap.test.ts` flakes and
`map.test.ts`'s 500 ms budget fails under full-suite load, so "npm run check is green" is not
currently a reliable signal.

**Approach:** One cycle that (a) lands the hardening code, (b) builds and runs the load-test
harness, (c) runs every automatable verification leg (check, PV consistency, bundle dead-strip,
Chromium full-pipeline smoke at 1366×768 on a local production build), and (d) writes the
release-gate report with the manual matrix that stays with Eric (Safari/Firefox/Edge, the
production pipeline run, the development→main merge). Eric rulings collected at the question gate
are folded here before ready-for-dev.

## Boundaries & Constraints

**Always:** Branch/PR against `development` (the default branch; cycles 128–130 sit there
un-merged — the gate runs against that tree, VERSION 0.17.131, PV 49 untouched). No gameplay,
balance, wire, or sim change of any kind — `shared/src` sim code untouched; the only `shared`
edit allowed is task 6's test-budget line in `shared/src/__tests__/map.test.ts`. Every fix is the
minimal mechanism (memory: don't overcomplicate). Test-budget widenings must keep their
order-of-magnitude regression-catch purpose and say so in a comment. The release-gate report
records what was verified, by whom, with evidence paths — never "assumed".

**Block If:** — all four rulings taken in-session via AskUserQuestion, 2026-08-27 (record:
epic-7 amendment 45): **(1) RULED: per-IP create throttle** on the solo-create door. **(2) RULED:
local + staging** for the load spike (staging matchmaking is password-gated: if `HC_STAGING_KEY`
is not available at execution time, the staging leg lands in the manual matrix as the exact
command for Eric — do not block on it). **(3) RESOLVED-STALE: the ≤720p collision already fixed**
— Eric recalled it moved, verified: `home.ts` `makeLiveness` is at `bottom:22px` with the
move-rationale comment; the report closes the ledger entry. **(4) RULED: read GPC as pre-emptive
denied** in `analytics/consent.ts`. Block only if a NEW unruled design/balance question surfaces
during implementation.

**Never:** No production load-spike without an explicit Eric instruction. No dev-server on
:5173/:2567 (scratch ports only). No re-tuning of any perf number, no NFR1 integrated-GPU work
(stays a ledgered Eric question). No CMP/ads/analytics code changes (production-only modules; the
report flags the post-merge smoke instead). No merge of `development`→`main` — that is Eric's QA
gate, not this cycle's. No new in-game copy. `/metrics`/`/liveness` stay open (by design).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| P toggle, prod build | `P` pressed in a production build | Nothing: binding absent (DEV-gated); no `NETCODE:` banner string in dist | — |
| P toggle, dev | `P` pressed under `import.meta.env.DEV` | Predict/interp flip works as today | — |
| loadTest local | `node server/scripts/loadTest.mjs` (self-boot, scratch port) | N clients spike-join (queue cohort + solo creates), drive inputs ≥60 s; exits 0 with a table: tick p50/p95/max, msg rate, joins ok/failed | Non-zero exit + named failing assertion |
| loadTest deployed | `HC_LOAD_TARGET=<url> [HC_STAGING_KEY=…]` | Same clients against the deployed tier via wss; `/metrics` polled over HTTP; staging cookie sent when key given | Refused joins reported per-cause (401 = gate, pv, capacity) |
| Bundle dead-strip | `npm run build` (client leg) | verify-bundle greps dist for worstcase tokens AND the netcode-banner token; build fails on a hit | Build exits non-zero, token named |
| ESC on /privacy, /how-to-play | mount + ESC | One handler, disposed on `pagehide`; double-mount guarded in `renderPage` | Second mount without destroy throws/no-ops (pick one, test it) |
| Solo-create flood | >N solo creates from one IP inside the window | Refused cleanly at the matchmake door; earlier rooms unaffected; a legit single player never hits it | Refusal is a clean matchmake error, never a crash |

</intent-contract>

## Code Map

- `client/src/input/keyboard.ts:361` -- unguarded `KeyP` binding (NFR17); gate at the binding site
- `client/src/main.ts:555,2040` -- netcode-toggle implementation + wiring; banner string is the bundle tell
- `server/scripts/loadTest.mjs` -- NEW; pattern: `queueSmoke.mjs` (self-boot + real-socket cohort), `soloSmoke.mjs` (create path), `metricsSmoke.mjs` (/metrics read)
- `server/src/metrics.ts` -- tick p50/p95/max + msg-rate surface the harness asserts against
- `client/scripts/readabilityCapture.mjs` -- `--verify-bundle` exists; extend token list, wire into client build script
- `client/package.json` / root `package.json` -- build/check wiring for verify-bundle
- `client/src/privacy/main.ts:57`, `client/src/how-to-play/main.ts:76` -- discarded `MountedPage` handles
- `client/src/ui/page.ts` -- capture-phase ESC bind; add double-mount guard + `pagehide` disposal
- `client/src/__tests__/radarHeatmap.test.ts` + `client/vitest.config.ts` -- timeout flake (per-file timeout or thread cap)
- `shared/src/__tests__/map.test.ts:554` -- 500 ms budget too tight under full-suite load
- `server/src/rooms/ArenaRoom.ts` `static onAuth` / `server/src/rooms/roomOptions.ts` -- per-IP throttle site (AuthContext carries request headers/ip; stagingGate shows the onAuth-refusal pattern)
- `client/src/analytics/consent.ts` -- GPC pre-emptive-denied site (ruled)
- `_bmad-output/implementation-artifacts/release-gate-2026-08-27.md` -- NEW; the gate report + manual runbook
- `VERSION`, `package.json`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- cycle close-out (0.17.131; one-line stamps; amendment 45 records the gate rulings)

## Tasks & Acceptance

**Execution:** (all rulings taken — 1–7 in any order, 8–9 last)

- [ ] 1. `client/src/input/keyboard.ts` + `client/src/main.ts` -- DEV-gate the `P` toggle -- NFR17; keep dev behavior byte-identical
- [ ] 2. `server/scripts/loadTest.mjs` -- build the harness (self-boot default, `HC_LOAD_TARGET` for deployed, staging-cookie support); run it locally and record results -- AR12/NFR10, the AC's named construction
- [ ] 3. `server/src/rooms/` -- per-IP solo-create throttle (ruled) + its test: cap creates per IP per minute at the matchmake door, clean refusal, tunable under `CONFIG.net` or a server constant -- the AC's "is RULED" clause
- [ ] 4. `client/scripts/readabilityCapture.mjs` + build wiring -- extend tokens (netcode banner), fail the build on a hit -- closes the "checked only when a human remembers" gap
- [ ] 5. `client/src/ui/page.ts` + both static-page mains -- retain handles, `pagehide` disposal, double-mount guard + tests -- the ledgered leak, now on two pages
- [ ] 6. `client/vitest.config.ts`/`radarHeatmap.test.ts` + `shared/src/__tests__/map.test.ts` -- make the gate reliably green (timeout/budget with rationale comments) -- the AC's own signal integrity
- [ ] 7. `client/src/analytics/consent.ts` -- read `navigator.globalPrivacyControl` as pre-emptive denied (ruled) + test -- legally binding opt-out; the 720p item needs NO code (already at bottom-left; report closes the ledger entry)
- [ ] 8. Verification legs -- full `npm run check`; PV-consistency grep; local production build + Chromium full-pipeline smoke at 1366×768 (solo-vs-AI path; scratch ports); loadTest run(s) per Q2 -- the gate itself
- [ ] 9. `release-gate-2026-08-27.md` + trackers + VERSION -- write the report with automated evidence + the manual matrix for Eric (browser matrix, production pipeline incl. ad break, HC_DEV_OPTIONS absence on prod env, post-merge analytics/ads smoke, development→main merge steps) -- the gate's deliverable

**Acceptance Criteria:**
- Given a production client build, when dist is grepped for the netcode banner and worstcase tokens, then zero hits — and the grep runs inside the build, not a README.
- Given `loadTest.mjs` self-boot, when a ≥40-connection spike lands (queue cohort + solo creates + input traffic), then the run exits 0 with tick p95 within its declared threshold and every join accounted for.
- Given the per-IP throttle, when one IP exceeds the create bound inside the window, then the matchmake request is refused cleanly, earlier rooms are unaffected, and a test pins both the refusal and the legit-single-player pass-through.
- Given `/privacy` and `/how-to-play`, when mounted and ESC'd, then exactly one handler fires and disposal is reachable (tested).
- Given three consecutive `npm run check` runs on this tree, then all three are green.
- Given the release-gate report, when Eric reads it, then every AC leg of Story 7.8 is either evidenced (path to artifact) or explicitly assigned to him in the manual matrix — nothing silently dropped, including the ledgered ≤720p collision disposition and the pending H5 interstitial.

## Spec Change Log

## Review Triage Log

## Design Notes

- Load test asserts against `/metrics` (`tick.p95`, `samples`, `messages.ratePerSec`) — the same
  numbers ops will watch; threshold declared in the script header, not hidden.
- The Chromium smoke covers Chrome only; Edge is Chromium-but-not-identical, so the report lists
  Edge/Firefox/Safari as manual. The production pipeline leg (ad break) cannot run anywhere but
  production and stays manual by design (staging absence-gates ads off).
- Flag-only in the report (open, not gate scope): integrated-GPU support line, `healthCheckPath`
  undeclared on both services, stale `HC_RADAR_*` env vars, `/metrics` publicly readable.

## Verification

**Commands:**
- `npm run check` -- green, three consecutive runs
- `npm run build` -- green, and fails when a debug token is planted (prove non-vacuous once, then remove the plant)
- `node server/scripts/loadTest.mjs` -- exits 0 with the results table
- `git grep -n "PROTOCOL_VERSION = " shared/src/index.ts` -- 49, unchanged

**Manual checks (if no CLI):**
- Chromium smoke screenshots at 1366×768: home, match HUD, refit, death/results — corner anatomy intact, no mono type below 9 px.
