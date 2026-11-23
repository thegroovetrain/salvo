---
title: 'Seen hulls draw over radar paint; rain over contact hulls, under the own hull'
type: 'bugfix'
created: '2026-11-23'
status: 'done'
baseline_revision: '10b8bc88e7848871812bb16b4895f1cc77d7fd3f'
final_revision: '0ea69565e8ac7d9ac70a111d4e2582594655fbc7'
review_loop_iteration: 0
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** The 2026-10-12 "smoke is paint" re-cut (Story 9.3) moved radar paint (`blip`) ABOVE contact hulls (`ship`), which undid Eric's 2026-08-13 ruling (epic-5 amendment 22: a hull you can see outranks its own echo). At range, the captain sees the radar return painted over a hull he actually has sight of, so he cannot aim at the hull.

**Approach:** A pure re-order of `CHART_LAYER_ORDER` in `client/src/render/stage.ts` (client-only, no wire change):
`map, zone, litZone, smoke, supplyChart, mineChart, dropChart, blip, ship, fog, plate, cloud, ownShip, aim, burstFx, chartMark, sweep`. Only `blip` and `fog` move; every pairwise relation not FORCED by the two moves is unchanged (Eric 2026-11-23: *"I meant everything we have discussed in this conversation only (rain, smoke). Everything else was fine, do not touch it."*).

Eric's rulings (2026-11-23, chat + AskUserQuestion):
1. *"If a ship is visible, all of its visible parts are visible OVER radar, not UNDER."* → `blip` below `ship`.
2. *"Only rainbands and fog go OVER the ships."* → Rain (the `fog` layer, `FogFieldView`) moves above contact hulls (AskUserQuestion: "Over enemies, under mine"); the countermeasure smoke `cloud` stays over contact hulls (AskUserQuestion: "Yes, smoke stays over hulls").
3. *"MY ship is ALWAYS visible on top of EVERYTHING. I need to be able to position myself."*, scoped by his follow-up to what was discussed → the own hull stays above rain and smoke (it already sits above `cloud` and `blip`); its seat below `aim`/`burstFx`/`chartMark`/`sweep` is NOT touched.

## Boundaries & Constraints

**Always:** Layer order stays declared data in `CHART_LAYER_ORDER`; `EVERY_LAYER_PLACED` compile check holds; `plate` stays above `ship` and above `fog` (names over rain, as today); `cloud` stays above `fog`; `blip` stays above `dropChart`; hull alpha/feather logic and the blip near-range dim mask are untouched.

**Block If:** Any change would require touching server, shared, the wire, or `PROTOCOL_VERSION`.

**Never:** Move `ownShip`, `aim`, `burstFx`, `chartMark`, `sweep`, `smoke`, `supplyChart`, `mineChart`, `dropChart`, `plate`, `cloud` relative to each other; change what is sent/hidden; change rain/cloud/hull rendering beyond their seat; move HUD-root layers; edit `CLAUDE.md`.

</intent-contract>

## Code Map

- `client/src/render/stage.ts` -- `CHART_LAYER_ORDER` + the `StageLayers` docs and header comment describing the stack.
- `client/src/render/fogField.ts` -- header comment naming the rain layer's seat.
- `client/src/render/countermeasure.ts` -- header comment naming the cloud's seat.
- `client/src/__tests__/hullOverRadar.test.ts`, `nameplatesAboveTerrain.test.ts`, `fogField.test.ts`, `countermeasure.test.ts` -- declared-seat relation tests.
- `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` line ~288 -- the Z-order paragraph.
- `_bmad-output/implementation-artifacts/epic-12-context-amendments.md` -- append the ruling.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/stage.ts` -- re-order `CHART_LAYER_ORDER` as above; update the layer docs (`ship`, `fog`, `cloud`, `blip`, `ownShip`, `dropChart`) and the order's doc comment to the new contract -- the fix.
- [x] `client/src/render/fogField.ts`, `client/src/render/countermeasure.ts` -- update the THE LAYER comment lines to the new seats -- comments must not lie.
- [x] the four tests -- rewrite the seat relations to the new contract: `ship` > `blip` > `dropChart`; `fog` = `ship`+1; `plate` = `fog`+1; `cloud` > `fog`; `ownShip` > `fog`, `cloud`, `blip` and < `aim`; untouched relations keep their existing assertions -- relations are the contract.
- [x] `DESIGN.md` -- append a dated re-cut note to the Z-order paragraph (minimal edit).
- [x] `epic-12-context-amendments.md` -- append one amendment (number placeholder until PR time) with the three verbatim rulings and the ledgered consequences.

**Acceptance Criteria:**
- Given a contact hull in sight and its radar return, when the chart renders, then the hull draws above the return.
- Given rain over a contact hull, when the chart renders, then the rain draws above the hull, its name draws above the rain, and the own hull draws above the rain and the smoke.
- Given any pair of layers other than (`blip`, `fog`) × anything, when comparing old and new order, then their relative order is unchanged.
- Given `npm run check`, then it passes.

## Spec Change Log

## Review Triage Log

### 2026-11-23 — Review pass
- intent_gap: 0 (the smoke-vs-paint seat question went to Eric; he ruled "DO NOT TOUCH THE SMOKE OR THE RAIN" — the cloud keeps its seat, so the paint sits under it as a side effect)
- bad_spec: 0
- patch: 5: (medium 2, low 3)
- defer: 0
- reject: 10 (rain/smoke re-seat suggestions overruled by Eric; render-tree test for a one-call wiring; spec/tracker items already handled at PR time)
- addressed_findings:
  - `[medium]` `[patch]` hullOverRadar pinned only `ship > blip`; now `ship === blip + 1` (nothing may slip between a hull and its echo).
  - `[medium]` `[patch]` countermeasure.test pinned `cloud > blip`, a side effect, as a contract; assertion removed.
  - `[low]` `[patch]` stage.ts / countermeasure.ts / DESIGN.md attributed the cloud-over-paint result to an Eric ruling; reworded: the cloud did not move.
  - `[low]` `[patch]` amendment placeholders numbered (19, cycle 252, 0.20.10); trackers stamped; VERSION / package.json / lockfile bumped.
  - `[low]` `[patch]` amendment (b) rewritten to Eric's final scope (rain and smoke untouched).

## Design Notes

Ledgered consequences Eric ruled implicitly (record in the amendment): because rain now sits above contact hulls and hulls above returns, rain also draws over radar paint, wounded-smoke plumes and supply/mine/crate marks; radar paint now draws under contact names and under the countermeasure cloud (reverses the 2026-10-12 cloud-under-paints seat — forced by cloud > hull > paint).

## Verification

**Commands:**
- `npm test -w client` -- all pass
- `npm run check` -- passes (run once at the end)

## Scope Change (Eric 2026-11-23, mid-implementation — SUPERSEDES the Approach order above)

*"we already handled smoke/fog vision occlusion so we don't need to touch it ... The rain and smoke are not a problem right now. Only ships being covered by radar returns when I should be able to see them. Only fix that."*

Target order: `map, zone, litZone, fog, smoke, supplyChart, mineChart, dropChart, blip, ship, plate, cloud, ownShip, aim, burstFx, chartMark, sweep`. Only `blip` moves. `fog` keeps its seat; `fogField.ts` and `fogField.test.ts` are untouched. Test relations: `ship` > `blip` > `dropChart`; `plate` = `ship`+1; `cloud` > `ship`; `ownShip` > `cloud`. AC 2 (rain over hulls) is void; the rain AC becomes: the rain's seat is unchanged.

## Auto Run Result

Status: done. Only `blip` moved in `CHART_LAYER_ORDER` (to directly under `ship`): a seen contact hull draws over its radar paint again. Rain (`fog`) and the countermeasure `cloud` keep their seats (Eric: "DO NOT TOUCH THE SMOKE OR THE RAIN"). Files: `client/src/render/stage.ts` (order + docs), `client/src/render/countermeasure.ts` (comment), three seat tests, DESIGN.md z-order note, epic-12 amendment 19, trackers, VERSION 0.20.10. Residual: radar paint now draws under contact names and under the smoke picture (side effect of the one move, recorded in amendment 19(b)).
