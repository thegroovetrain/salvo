---
title: 'Broadside zero-overlap arc ladder + per-turret arc display'
type: 'feature'
created: '2026-08-27'
status: 'in-review'
baseline_revision: 'd5a35c7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/batch-sim-evidence-2026-08-24.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The broadside is too accurate: each turret's arc is ±33.5° at base against mounts only 18.67° apart, so all four arcs overlap massively and nearly every click gets every gun. Eric (2026-08-24, ruled; re-confirmed with specifics 2026-08-27): at baseline the per-turret arcs must have ZERO overlap — *"an inaccurate shotgun that gradually gets better"* — and the player must SEE the individual turret arcs to aim.

**Approach:** Retune the cycles-113-115 emergent-arc machinery (no new mechanism): the SPREAD ladder becomes a per-rung pair (mount-bearing spread, traverse) where the wedge aim-directions rotate toward the beam and the wedges widen slightly, per the four Eric rulings below. Render per-turret wedges from each gun's real hull position; shrink the legal twin-sector to a thin outline; distinguish on-click vs arc-clamped shells in the aim preview.

### Eric rulings (2026-08-27, AskUserQuestion gate — attribution: Eric, verbatim choices)

1. **Overlap schedule:** base + card 1 + card 2 = zero overlap (dead gaps shrink; card 2 ~touching); overlap starts at card 3; heavy at card 4.
2. **Max choke = TRUE CONVERGENCE:** mounts rotate inward AND traverse widens across the ladder, so at 4 cards all guns can angle onto one abeam click from mid range out. DRAFT ladder accepted as draft: mountSpread ±[28, 25, 22.5, 15, 6]°, traverse ±[6, 7, 7.5, 9, 14]°.
3. **TURRETS card interaction:** ACCEPT emergent gap-closing from denser guns (6 turrets at base traverse barely touch). The zero-overlap promise is stated at the base 4-gun battery. Do NOT derive traverse from gun count.
4. **Arc display:** bright per-turret wedges drawn from each gun's real muzzle position + the ±60° legal sector reduced to a THIN OUTLINE (no fill; still marks deny boundary). Aim preview distinguishes shells landing ON the click from shells clamped to their arc edge.

Prior ruling of record (batch-sim-evidence-2026-08-24.md, Design ruling 2): the cycle-114 pin `mountSpread + base traverse ≥ arcHalfArcDeg` becomes **tier-dependent and deliberately false at low rungs** — rewritten per-rung, not deleted.

## Boundaries & Constraints

**Always:**
- Ladder numbers are DRAFT — tune freely, but the rung-by-rung overlap SCHEDULE (ruling 1) and top-rung abeam convergence (ruling 2) are ruled and pinned at the base 4-turret count.
- `effectiveStats()` stays the only derivation path: `traverseRad` AND the new `mountSpreadRad` derive from `spreadRung` post-fold in BOTH `stats.ts clampStats` and `boons.ts applyBoonStats`; neither is on `BOON_STAT_PATHS`.
- One geometry source: render + preview reuse `turretMuzzles`/`turretMountBearings`/`turretAimPoints` (identity pose for hull-local render) — never re-derive turret geometry client-side.
- `PROTOCOL_VERSION` 48 → 49 with a dated wire-change log line (behavioral CONFIG both sides must agree on; cycle-122 precedent).
- Measurement discipline (ruled 2026-08-24): balance-touching PR gets a same-night campaign (`--bot-spend random --roster even --raw`) compared against the 2026-08-24 campaigns, plus the `balanceProbe` onClick table before/after.
- Complexity ≤ 10; card NAMES and rung names untouched (naming law).

**Block If:** the twin-sector legal geometry (`arcOffsetDeg`/`arcHalfArcDeg` 90/60) would need to change; or new player-facing card copy must be INVENTED beyond a factual mechanics note (flag notes for Eric's pass instead); or campaign evidence would demand retuning non-broadside CONFIG to compensate (record evidence, do not rebalance).

**Never:** no designed fan revival (`fanBearings` stays dead); no per-gun-count traverse derivation (ruling 3); no change to damage/reload/turrets/range scalars (cycle-122 numbers stand); no bot weight-table retune (ledgered as balance-pass work); no in-game help copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Base click in a dead gap | rung 1, legal click between two wedges | 0 guns onClick; every gun fires at its arc LIMIT at the click's range (shotgun pattern) | No error; not denied |
| Base click inside one wedge | rung 1, click in turret i's arc | exactly turret i onClick; others clamp | — |
| Card-2 adjacency | rung 3, base 4 turrets | adjacent wedges touch or leave a gap: `2·traverse ≤ gap` (gap = 2·mountSpread/3) | pinned |
| Max choke abeam | rung 5, abeam click ≥ ~300u | ALL turrets onClick (true convergence) | pinned |
| Max choke off-center | rung 5, click near ±60° edge | fewer guns connect (ruled: "fewer connecting off-center") | — |
| 6 turrets, base traverse | TURRETS ×2, rung 1 | slight wedge touching accepted; zero-overlap pin applies at count 4 only | — |
| Click outside both sectors | bow/stern dead zone | denied via existing path, unchanged | denial pulse |
| Clamped vs on-click preview | any barrage preview | clamped shells visually distinct from on-click shells | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1357-1458` -- CONFIG.broadside: `turretMountSpreadDeg` scalar → per-rung array; `traverseDeg` retuned; comment block rewritten (supersedes cycle-115 386u tuning notes)
- `shared/src/sim/aim.ts:174-247` -- `turretMountBearings` (takes mountSpread rad param, stops reading CONFIG), `turretAimPoints` (threads it)
- `shared/src/sim/stats.ts:204-214,253-265,351-355` -- seed + `clampSpreadRung` + `broadsideTraverse`; add sibling `broadsideMountSpread`; re-pin both post-fold
- `shared/src/sim/boons.ts:677-678` -- sibling re-pin; `:384-392` broadsideSpread card (id/effects unchanged; factual note update flagged for Eric)
- `server/src/game/equipment/broadside.ts:62-140` -- thread `mountSpreadRad` into `turretAimPoints`
- `client/src/render/aimPreview.ts:284-306` -- thread `mountSpreadRad`; carry `TurretAim.onClick` into the preview model; clamped-shell styling
- `client/src/render/firing.ts:36,109-110,172-248` -- `drawTwinArcs` → per-turret wedges from identity-pose muzzles/mounts + thin legal outline (reuse `sectorOutline`); lit/dim/denied states preserved
- `client/src/config.ts:770-816` -- new styling knobs (per-turret wedge radius/alphas, legal-edge width/alpha, clamped-shell preview alpha)
- `shared/src/index.ts` -- PV 48 → 49 + wire-change log entry
- `server/src/game/ai/equipment.ts:295-322` -- stale fan comment rewritten; `fanAcceptsPlot` gate is semantically CORRECT again under the new ladder (high rung = tight choke = needs live track) — verify, don't invert
- `server/scripts/batchsim/balanceProbe.ts:58-91` -- iterate per-rung mount+traverse pairs
- `server/scripts/batchsim/overrides.ts:146-163` -- guard the new array like `traverseDeg`
- `server/scripts/batchsim/catalogMetrics.ts:48-62` -- DAMAGE_SOURCES reads amounts from CONFIG (stale broadside 20→15; gun/broadside collision gets an honest merged label)
- Tests: `shared/src/__tests__/aim.test.ts:145-192`, `barrel.test.ts:399-407`, `stats.test.ts:113,184-193`, `boons.test.ts:271-272`, `server/src/__tests__/broadside.test.ts:217-287`, `botTactics.test.ts:1487-1510`, `client/src/__tests__/aimPreview.test.ts:315-340,730-763`, `boonCopy.test.ts:235-245`

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- per-rung ladder arrays + rewritten rationale comment recording the 2026-08-24/27 rulings
- [x] `shared/src/sim/stats.ts` + `shared/src/sim/boons.ts` -- `mountSpreadRad` derived beside `traverseRad`, re-pinned post-fold both sites, absent from `BOON_STAT_PATHS`
- [x] `shared/src/sim/aim.ts` -- parameterize mount spread; update doc comments (coverage clause per-rung)
- [x] `server/src/game/equipment/broadside.ts` + `client/src/render/aimPreview.ts` -- thread stats through the one shared aim solution
- [x] `client/src/render/firing.ts` + `client/src/config.ts` -- per-turret wedge render (ruling 4), legal-sector thin outline, denied/lit states; complexity ≤ 10 via helpers
- [x] `client/src/render/aimPreview.ts` -- clamped-vs-onClick shell distinction in the preview model + styling
- [x] `shared/src/index.ts` -- PV 49 + log line
- [x] Shared/server/client test pins rewritten deliberately: zero-overlap schedule pin (rungs 1-3), strict-overlap pin (rungs 4-5), top-rung abeam convergence pin, dead-zone-exists pin (rung 1), mount monotonic non-increasing + traverse non-decreasing, ladder-length = copies+1 for BOTH arrays; update CONFIG literals, stats walks, broadside convergence counts, aimPreview expectations; new render coverage for per-turret wedges (greenfield)
- [x] `server/src/game/ai/equipment.ts` -- comment truth pass; keep gate polarity
- [x] `server/scripts/batchsim/{balanceProbe,overrides,catalogMetrics}.ts` -- instrument updates (probe per-rung, guard, damage attribution from CONFIG)
- [x] `VERSION` + root `package.json` 0.17.130; `sprint-status.yaml` + `gds-workflow-status.yaml` one-line stamps
- [x] Evidence: `balanceProbe` arc tables + Eric-approved 96-match trend run vs 2026-08-24 baselines → `batch-sim-evidence-2026-08-27.md` (scale superseded by Eric's 2026-08-27 ≤99-match / ask-first rulings, recorded there)

**Acceptance Criteria:**
- Given base 4 turrets at rungs 1-3, when adjacent wedges are compared, then `2·traverse ≤ mount gap` (zero overlap; rung 3 may touch), and at rungs 4-5 `2·traverse > gap` strictly.
- Given rung 1 and a legal click centered in a dead gap, when `turretAimPoints` resolves, then 0 shells are onClick and all fire at arc limits at the click's range.
- Given rung 5 and an abeam click at ≥ ~300u, when resolved, then every turret is onClick.
- Given the broadside primed, when the arc display renders, then one wedge per turret draws from that turret's muzzle position with visible gaps at low rungs, the ±60° sector is a thin outline, and the lit/denied grammar matches the current wedges' behavior.
- Given a barrage preview with mixed bearing/clamped shells, when drawn, then clamped shells are visually distinct (per ruling 4).
- Given TURRETS ×2 at rung 1, when wedges are compared, then slight touching is permitted (no pin asserts zero overlap at count 6).
- Given `npm run check`, then lint + tsc + all workspaces green.

## Spec Change Log

- 2026-08-27 (Eric rulings, mid-run, supersede the Always measurement clause's SCALE): no sim run is ever launched unprompted — ask first; approved quick checks are ≤99 matches (hard cap); full campaigns only when Eric names them. The clause's intent (measure balance-touching changes) stands. This run's 96-match check was Eric-approved interactively.

## Auto Run Result

- **Implemented:** the broadside zero-overlap arc ladder (Eric rulings 2026-08-24/27) — SPREAD now drives per-rung mount spread [28,25,22.5,15,6]° AND traverse [6,7,7.5,9,14]°: zero overlap through card 2 (touching), overlap from card 3, true convergence at max choke (~265u+ abeam); per-turret wedge display from real muzzle positions with the legal sector as a thin outline; aim preview marks arc-clamped shells; PV 48→49; 0.17.130.
- **Files:** shared (constants, stats, boons, aim, index PV), server (equipment/broadside, ai/equipment comments), client (firing wedge render, aimPreview clamped pass, config knobs, main threading), batchsim instruments (balanceProbe, catalogMetrics lazy CONFIG-derived attribution, overrides guard), ~10 test files rewritten deliberately + firingArcs.test.ts new; VERSION/package/trackers; CLAUDE.md supersession stamp; deferred-work +4.
- **Review:** dual adversarial pass → 15 patches applied (NaN/ladder hardening, instrument correctness, doc/ledger integrity, render memo, test strengthening), 4 deferred to deferred-work.md, 2 rejected. No intent_gap, no bad_spec.
- **Verification:** `npm run check` green (5716 tests: 784/1702/3230), balanceProbe schedule/convergence tables match the rulings exactly, visual QA on a live PV-49 solo match (wedges/gaps/lit-side confirmed by screenshot), 96-match trend run: BS 44.6%→24.0% / ML 32.5%→44.8% / TB 22.9%→31.3% vs the 08-24 baseline — recorded with the bots-can't-aim-the-ship caveat in `batch-sim-evidence-2026-08-27.md`; no rebalance taken.
- **Residual risks:** DRAFT ladder numbers await Eric's on-water tuning; bot broadside play unretuned for the new ladder (deferred); clamped-preview distinction and rung-5 display unverified by eye; BS win-share drop is Eric's call to accept or retune.

## Review Triage Log

### 2026-08-27 — Review pass (Blind Hunter + Edge Case Hunter, deduplicated)
- intent_gap: 0
- bad_spec: 0
- patch: 15: (high 0, medium 6, low 9)
- defer: 4: (high 0, medium 3, low 1)
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` non-finite spreadRung clamps to 1 + paired-ladder length asserted at load (NaN-radian poisoning closed)
  - `[low]` `[patch]` negative mountSpreadRad guard in turretMountBearings (uncrossed pairing inversion via batchsim --set)
  - `[medium]` `[patch]` catalogMetrics DAMAGE_SOURCES built lazily post-overrides (import-time capture defeated --tune attribution)
  - `[low]` `[patch]` buoy-gun exact === routed through AMOUNT_EPS + collision merge; TICK_S derived from the shared step
  - `[low]` `[patch]` balanceProbe: turrets≤1 gap guard, epsilon touching verdict, defensive ladder indexing
  - `[medium]` `[patch]` tracker stamps repointed off the nonexistent "amendment 45" to batch-sim-evidence-2026-08-27.md
  - `[medium]` `[patch]` four deferred-work ledger entries written (were code comments only)
  - `[medium]` `[patch]` CLAUDE.md broadside entries given minimal cycle-130 supersession stamps
  - `[low]` `[patch]` lit/dim alphas single-sourced with sector(); legal-outline helper dedup; reload-sweep denied-color verified
  - `[low]` `[patch]` densify pin strengthened past the vacuous 0≥0 case
  - `[low]` `[patch]` one-slot memo for per-frame wedge geometry allocations
  - `[medium]` `[patch]` lit/denied alpha-selection logic gained direct test coverage (visual pass separate)
  - deferred: all-clamped preview uniform-faintness (Eric design question); 5-turret centre-gun always-bears-abeam emergent consequence; bot broadside weights unretuned for the new ladder; card-face choke unnamed (Eric copy)
  - rejected: spec-code-map/boonCopy.test mismatch (test reads derived values — no change was needed); "measurement discipline unmet" (the ruled campaign was already running in-session; evidence lands before the PR)

## Design Notes

Out-of-arc turrets already clamp to their arc edge and fire at the click's range (`turretAimPoints`), so dead zones produce a wide shotgun pattern, never a refused shot — the deny boundary stays the ±60° twin sector only. The uncrossed mount pairing (bow-most gun owns bow-most arc) is what makes parallax fight convergence up close; with traverse 14° > mountSpread 6° at max choke, abeam convergence begins where `atan(hullOffset/R) ≤ traverse − mountSpread` (~265u for the outer guns). Render reuse: call `turretMuzzles`/`turretMountBearings` with an identity pose (0,0,heading 0) to get hull-local geometry for the `arcs` Graphics (already hull-local via position+rotation).

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green (updated pins included)
- `node --experimental-strip-types server/scripts/batchsim/balanceProbe.ts` (or its documented invocation) -- expected: onClick table shows 0-guns rows at low rungs / all-guns abeam rows at rung 5
- balance-sim campaign per `batch-sim-evidence-2026-08-24.md` measurement-discipline row -- expected: evidence file written and compared against the 2026-08-24 campaigns; no auto-rebalance taken

**Manual checks (if no CLI):**
- Screenshot/eyeball pass of the per-turret wedges at rungs 1 and 5 (dev client) if a dev server is already running — otherwise note as untested-by-eye in the PR body.
