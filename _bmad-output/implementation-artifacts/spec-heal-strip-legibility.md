---
title: 'The DAMAGE CONTROL rail, made choosable'
type: 'bugfix'
created: '2026-08-05'
status: 'in-review'
baseline_revision: 'cf74009'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The cycle-46 DAMAGE CONTROL rail is illegible and reads as a seam, not an option. Eric, verbatim: *"the interface looks like ass. You dropped a bar in under the 4 upgrade card choices and its just plain fucking tiny and hard to read/see. It doesn't even have any padding!"* The geometry is factually as described — `stripHeight` 16px, `stripFontSize` 10px, `stripKeyChip` 14px, `padding:0 8px` (zero vertical padding), a 2px seam under the row — and it was shipped as *unratified implementer draft* with two acknowledged DESIGN.md type deviations, already ledgered for exactly this retune (`deferred-work.md`, cycle-46 entry). The 10px type also sits BELOW amendment 15's 14px legibility floor, which retired micro-type for load-bearing text.

**Approach:** Give the rail the size it needs and buy the vertical room by lifting the band. `bandTopFrac` 0.58 → 0.534 on every viewport (Eric's ruling), and the rail becomes a 40px padded button in the card's own grammar: the 22px key-chip family, 14px type, real vertical padding, an 8px seam. The four-card row stays byte-identical — 216px cards, 20px gaps, 924px, `CONFIG.offer.size` 4 — and the readout copy moves to Eric's phrasing.

## Boundaries & Constraints

**Always:**
- The RATIFIED ROW IS UNTOUCHABLE: four 216×236 cards, 20px gaps, 924px, `CONFIG.offer.size` 4. `refitBandLayout()` must return byte-identical `cards[]` widths/heights/gaps and `row.w`/`row.h` before and after this change. The existing regression pin stays green on every clause EXCEPT its band-anchor line.
- The heal stays a SIBLING of the row, never a member: never drawn, never in `DeckState` or `OwnShip.offer`, still addressed by `HEAL_CHOICE = -1`. Deck composition, draw math and rare density are byte-identical.
- Rail type sizes clear amendment 15's 14px legibility floor and the 9px mono floor at the 90% UI-scale tier; the key chip returns to the ONE 22px chip family (hotbar / helm / card digits).
- The rail keeps every behavior it already has: real `<button>`, genuinely `disabled` when the server would refuse, `lockedAlpha` dim, dual-coded status word, amber-on-armed, the 80ms denied edge pulse, focus hygiene (mousedown preventDefault + post-click blur) so a click can never fire the gun.
- THE CONTAINER-FIT LAW (amendment 47) holds at BOTH ratified floors — 1366×768 @100% and the 1280×614 logical floor of the 125% tier. Nothing clips off the bottom edge, and every mark fits inside the rail box on both axes (`refitStripMetrics` overflow ≤ 0).
- The below-center keep-out holds: `band.y > screenH / 2` at both floors, so the own hull at screen center stays clear.
- Rail copy prints `CONFIG.damageControl`'s own numbers — never hardcoded amounts.

**Block If:**
- A 40px rail cannot satisfy BOTH the bottom-edge clip check AND the below-center keep-out at the 1280×614 floor at any `bandTopFrac`. (It can: at `row.y` 328 the rail ends at 612 ≤ 614 and `band.y` 310 > 307. If an unforeseen constraint breaks this, HALT rather than shrink a card, shrink the rail below legibility, or drop the keep-out.)

**Never:**
- Never shrink a card, change the card count, or make heal a fifth card / the last card slot — Eric weighed heal-takes-a-card-slot in this run and declined to spend a deck card on it (amendment 58's rejection stands).
- Never touch server, shared, or wire code. This cycle is client presentation only: no `PROTOCOL_VERSION` bump, no `CONFIG.damageControl` value change, no change to heal mechanics, guards, pool math or self-privacy.
- Never edit DESIGN.md / EXPERIENCE.md / gdd.md in-cycle (house rule); record drift in the ledger.
- Never let the rail's growth push the band over the own hull at screen center, and never buy room by trimming `pipsAbove` or `cardHeight`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Floor viewport | `refitBandLayout(1280, 614)` | `row.y` 328; `strip.y` 572, `strip.h` 40, bottom 612 ≤ 614; `band.y` 310 > 307 | Layout pin fails the suite if either margin goes negative |
| Second floor | `refitBandLayout(1366, 768)` | `row.y` 410; rail bottom 694 ≤ 768; `band.y` 392 > 384 | Same pin |
| Row untouched | Any viewport, rail present | `cards[]` all 216×236, gaps 20, `row.w` 924, `row.h` 236, `CONFIG.offer.size` 4 | Regression pin fails on any drift |
| Rail content fit | Widest copy (armed label + readout, or inert + `AT FULL HP`) | `refitStripMetrics().overflowX ≤ 0` and `overflowY ≤ 0` | Container-fit pin fails |
| Armed rail | alive, damaged hull | 40px rail, live hairline edge, amber on hover/focus, no status word, clickable | No error expected |
| Inert rail | full HP or sunk hull | `disabled`, dimmed to `lockedAlpha`, reason word printed, click is a no-op | Existing fail-closed path, unchanged |
| Denied pulse | server rejects a heal pick | 80ms denied edge on the rail, unchanged by the resize | Existing pulse path, unchanged |
| 90% UI scale | rail type at the 90% tier | 14px × 0.9 = 12.6px, above the 9px mono floor | Type-floor pin |

</intent-contract>

## Code Map

- `client/src/config.ts` -- `CLIENT_CONFIG.refit`: `bandTopFrac` 0.58 → 0.534 (with the arithmetic in its comment) and the DAMAGE CONTROL strip block (`stripHeight`, `stripGap`, `stripKeyChip`, `stripFontSize`, `stripPad`, `stripColGap`, plus a new vertical-padding knob). The strip block's WHY-A-RAIL comment currently justifies the 22px budget and must be rewritten to the new ruling.
- `client/src/ui/upgradeMenu.ts` -- `refitBandLayout()` doc comment (the "22px budget" / "no band lift" prose is now stale); `STRIP_CSS` (vertical padding), `STRIP_CHIP_CSS`, `STRIP_TEXT_CSS`; `healReadout()` copy.
- `client/src/ui/refitCardFit.ts` -- `refitStripInnerBox()` / `refitStripMetrics()`: the pure fit model that pins the container-fit law for the rail; must account for the new vertical padding.
- `client/src/__tests__/upgradeMenu.test.ts` -- the band-anchor pins (lines ~109, ~166), the rail geometry pins (~171-196) and the below-center pins; re-taken deliberately at the new anchor and height.
- `client/src/ui/refitCardFit.ts` is the fit MODEL; its rail PINS live in `client/src/__tests__/upgradeMenu.test.ts` alongside the geometry (there are no strip cases in `refitCardFit.test.ts`), so the new type-floor and inner-box pins land there too.
- `_bmad-output/implementation-artifacts/epic-2-context-amendments.md` -- append the 2026-08-05 rulings (amendments 65-67).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the cycle-46 "strip geometry is unratified draft" entry; the heal TONE half of that entry stays open.
- `VERSION`, `package.json`, `sprint-status.yaml`, `gds-workflow-status.yaml` -- 0.17.46 → 0.17.47, both trackers in this same PR.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/config.ts` -- retune `bandTopFrac` to 0.534 and the six strip knobs (`stripHeight` 16→40, `stripGap` 2→8, `stripKeyChip` 14→22, `stripFontSize` 10→16, `stripPad` 8→14, `stripColGap` 10→14) plus a vertical-padding knob; rewrite both comment blocks so the recorded arithmetic matches the shipped numbers -- the old comments justify a budget that no longer exists, and a stale rationale is worse than none.
- [x] `client/src/ui/upgradeMenu.ts` -- apply the vertical padding in `STRIP_CSS`, size the chip and text from the retuned knobs, and rewrite the `refitBandLayout()` doc block ("the rail's whole 18px budget", "no band lift bought the rail room") -- the layout function is the single source the DOM and the tests both read.
- [x] `client/src/ui/upgradeMenu.ts` -- `healReadout()` copy to Eric's phrasing (`RESTORES 25 HP NOW AND 25 HP OVER 5S` shape), still composed from `CONFIG.damageControl` -- a retune of the ruling must keep moving the rail's own copy.
- [x] `client/src/ui/refitCardFit.ts` -- extend the rail fit model for vertical padding so `overflowY` stays honest -- the fit model IS the container-fit law's proof, not the CSS.
- [x] `client/src/__tests__/upgradeMenu.test.ts` -- re-take the band-anchor and rail-geometry pins at the new values; ADD explicit floor pins for the two margins that now matter (rail bottom vs viewport edge, `band.y` vs `h/2`) so any future geometry drift fails loudly -- the old pins were written to assert the exact thing this cycle changes.
- [x] `client/src/__tests__/upgradeMenu.test.ts` -- re-take the rail fit pins where they actually live; add a type-floor pin (shipped size × the 0.9 tier ≥ the 9px mono floor) and an inner-box pin proving the model subtracts the new vertical padding -- amendment 15's floor should be enforced, not just honored, and a fit model that ignores padding passes falsely.
- [x] `client/src/__tests__/upgradeMenu.test.ts` -- keep the untouchable-row regression pin green on every clause except the band anchor, and assert the rail still never overlaps a card -- the row's byte-identity is the property this cycle must not break.
- [x] `_bmad-output/implementation-artifacts/epic-2-context-amendments.md` -- append amendments 65-68 (the band lift, the rail size, heal-as-a-card declined, the copy change) -- rulings need a durable home before the compile can erase them.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- close the strip-geometry half of the cycle-46 entry, leaving the tone half open -- the ledger is only useful if closures are recorded.
- [x] `VERSION` + `package.json` + `sprint-status.yaml` + `gds-workflow-status.yaml` -- 0.17.47 and both trackers -- every landed PR updates BOTH trackers.

**Acceptance Criteria:**
- Given the refit band open at any viewport, when the DAMAGE CONTROL rail renders, then it is 40px tall with vertical padding, a 22px key chip and 16px type — no mark below the 14px legibility floor.
- Given the refit band open at either ratified floor, when the layout is computed, then nothing clips off the bottom edge and the band's top edge stays below the vertical center.
- Given the rail is present, when the card row is measured, then the four cards, their gaps and the 924px row are byte-identical to the pre-change layout.
- Given a damaged hull, when the rail is clicked or `5` is pressed, then the heal spends exactly as it does today — this cycle changes no behavior, only presentation.
- Given `npm run check`, when it runs, then lint, type-check and all suites pass.

## Spec Change Log

### 2026-08-05 — implementation deviations from the planned values (recorded, not amended)

Two things shipped differently from the plan text. Neither breaks the intent-contract; both are recorded here because that block is read-only during implementation and now under-states what landed.

1. **Rail type shipped at 16px, not the planned 14px.** The contract's binding rule is *"Rail type sizes clear amendment 15's 14px legibility floor"* — 16 clears it with a step to spare, so this is a strengthening rather than a departure from intent. It was taken once the fit model showed the widest copy spends only ~705 of 894 available px and that `lineBox(16, 1.2) = 20 ≤ 22` (the key chip's height, which sets the rail's inner box) — i.e. the larger register was free on BOTH axes, and legibility is the entire defect being fixed. Known-bad state avoided: shipping the floor value "because it is the floor" on the one surface whose complaint was that it is too small to read. CONSEQUENCE: the I/O matrix's 90%-tier row still reads "14px × 0.9 = 12.6px"; the shipped arithmetic is 16 × 0.9 = 14.4px and its claim (clears the 9px mono floor) holds with more margin than written. KEEP on any re-derivation: choose the type size against the fit model's measured headroom, not by assuming the floor.

2. **The rail's fit pins live in `upgradeMenu.test.ts`, not `refitCardFit.test.ts`.** The plan named the latter; it carries no strip cases at all — the cycle-46 author put the rail pins beside the geometry pins. Pins landed where they actually live, and the Code Map plus task list were corrected to match, rather than a new test file being invented to satisfy a wrong path.

## Review Triage Log

## Design Notes

**Where the 40px comes from (the arithmetic that must survive review).** At the 1280×614 logical floor the band is boxed on two sides: the pips row must stay below the vertical center (`band.y > 307`, the own-hull keep-out) and the rail must stay above the screen edge (`row.y + 236 + 8 + 40 ≤ 614`). That leaves `row.y ∈ (325, 330]` — five pixels of total slack. `bandTopFrac` 0.534 lands `row.y` at 328, splitting it 3px above the keep-out and 2px below the edge. The tightness is inherent: a 236px card row plus a genuinely legible rail nearly fills a 614px viewport, which is exactly why the cycle-46 implementer squeezed the rail instead of lifting the band — that option was closed to them by amendment 40's "no band lift", and it is open now only because Eric reopened it.

**Why not heal-as-a-card.** Eric raised it live in this run ("maybe we should still have just 4 cards and have it be the last card") and did not take it. The cost is structural: heal in a card slot means three deck cards per level instead of four, thinning every level-up's build choice by 25% forever, which is the same objection that produced amendment 58's rejection. The rail stays a sibling.

**The chip returns to the family.** Cycle 46 dropped to a 14px chip because "a 22px chip cannot fit a 16px rail" — true then, moot now. At 40px the ONE key-chip family fits, so the DESIGN.md "proportional below" carve-out the ledger flagged is no longer needed and dies with this cycle.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity violations (ESLint complexity ≤ 10).
- `npm test -w client` -- expected: all pass, including the re-taken geometry and fit pins.
- `npm run check` -- expected: lint + type-check + full suite green across all three workspaces.
- `npm run build` -- expected: shared → client → server build clean.

**Manual checks:**
- Open the refit band at 1280×614 and 1366×768: four 216px cards, 924px row, a 40px padded rail below with a readable label, nothing clipped or overlapping (container-fit law).
- Confirm the rail reads as a pressable option at a glance — the defect being fixed is legibility, so the check is perceptual, not only arithmetic.
