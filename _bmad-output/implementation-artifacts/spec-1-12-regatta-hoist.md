---
title: 'The Regatta Hoist'
type: 'feature'
created: '2026-07-23'
status: 'in-progress'
baseline_revision: '037d05305cfdbf5f48a0a2ab040b3a74c52ed796'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Story 1.12 (epics.md, UX-DR6/7/8/17). Every hull wears the same legacy green/amber, the kill feed is monochrome amber, and nothing on any screen says who anyone is — the personal-color identity system the 20-hue Regatta wheel (already tokenized in 1.11) was built for does not exist.

**Approach:** The server assigns each human a unique hue index (0–19) at join and it rides the roster (`PlayerMeta.color`) so every screen agrees. Client renders: hull outline in the bright hue + interior in its ~45%-value fill, own wake in the hue, ordnance markers (mines/lit-zones/decoys) in the FIRER's hue for all observers (Eric granted wire attribution), kill-feed names in 600-weight lightened text-safe variants. Drones stay greyscale everywhere (sentinel 255). PV 10→11.

## Boundaries & Constraints

**Always:** Color index rides ONLY the roster schema — never spatial frames. Wheel ORDER is single-sourced in shared (`REGATTA_HUES`, 20 names, the ratified wheel order = the existing `colors.players` key order); hex values stay client tokens. Eric rulings 2026-07-23 (supersede conflicting doc wording, log doc-sync to deferred-work): (1) assignment is FIRST-COME-FIRST-SERVED at join — pref if free, else nearest free by circular index distance (tie → ascending/clockwise), no pref → seeded-random free hue; no match-start redraw, colors never change mid-match; (2) wake follows the personal hue; (3) ordnance recolors to firer's hue for ALL observers, `MineView`/`DecoyView` gain `by` (owner ship id) — a deliberate intel grant; (4) the 8 undocumented interior fills are computed by the documented ~45%-value rule (the 12 DESIGN-documented fill hexes are used VERBATIM, never recomputed) and the 20 text-safe variants are computed by lightening toward white until contrast ≥ 4.5:1 vs `void` (returns the raw hue when it already passes). All new color code references `CLIENT_CONFIG.colors.*` — the tokens.test.ts guard scan stays green. Perception invariant tests stay green and cover the new `by` fields. Reserved bands (amber/red/storm-violet/phosphor-green) are excluded by wheel construction — the wheel is the only assignment source. Complexity ≤ 10; msgpack key order preserved (append `by` last).

**Block If:** Any wire/schema field beyond `PlayerMeta.color`, the `colorPref` join option, `MineView.by`, `DecoyView.by` becomes necessary. A needed color value is neither DESIGN-documented nor derivable by the two ratified mechanisms. DESIGN.md frontmatter contradicts itself on a consumed value.

**Never:** No blip coloring or Variant P flag (Epic 4). No nameplates or waiting-room contested-hoist toast (1.13+). No Color Hoist picker UI or callsign field (1.14 — this story only plumbs a persisted `colorPref` join option with no UI writer). No results-screen name coloring. HUD chrome stays phosphor-functional. No fair-random contention draw (superseded). Never remove the decoy counterIntel contact-coexistence guard or alter blip shapes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pref free | join `colorPref: 7`, 7 unused | `meta.color = 7` | — |
| Pref taken | join `colorPref: 7`, 7 used, 6+8 used, 5+9 free | nearest free circular; tie 5 vs 9 → 8+1=9 (ascending/clockwise wins) | — |
| No pref | join without `colorPref` | random FREE hue from a decorrelated roster-only `mulberry32` stream | — |
| Invalid pref | `colorPref: 25 / -1 / 3.5 / "x"` | sanitized to undefined → no-pref path | silently dropped |
| Drone fill | `fillToCapacity()` | `meta.color = 255` (sentinel); renders drone greys everywhere | — |
| Wheel exhausted | 20 humans hold all hues (cap = 20 → unreachable) | defensive: joinOrder % 20, never throw | — |
| Reconnect | player rejoins within grace | meta persists → color unchanged | — |
| Roster miss | firer id absent from roster (left match) | hull/ordnance falls back to `amber`; feed name falls back to `text-secondary` | no throw |
| Old client | joins with `pv: 10` | rejected at matchmake (PV now 11) | protocolVersionError |
| Long name | kill-feed name > 14 chars | mid-ellipsized to 14 total (`ABCDEFG…UVWXYZ`) | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `REGATTA_HUES` (20 hue names, wheel order — matches `colors.players` key order verbatim) + `REGATTA_NO_HUE = 255`.
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 10 → 11 (roster schema field + join option + MineView/DecoyView shape change).
- `shared/src/types.ts` -- `MineView.by: string`, `DecoyView.by: string` (appended LAST — msgpack key order is load-bearing; update both doc comments' intel notes). `LitZoneView.by` already exists.
- `server/src/game/regatta.ts` -- NEW pure assignment: `assignHue(used: ReadonlySet<number>, pref: number | undefined, rng: Rng): number` implementing FCFS/nearest-free/random-free + exhaustion fallback. Zero Colyseus imports.
- `server/src/rooms/schema/ArenaState.ts` -- `PlayerMeta` gains `@type('uint8') color = 255`.
- `server/src/rooms/roomOptions.ts` -- sanitize `colorPref` (integer 0–19 else undefined; never dev-gated).
- `server/src/rooms/ArenaRoom.ts` -- onJoin: compute used set from `state.players`, `meta.color = assignHue(...)` (rng: `mulberry32(mapSeed ^ <fresh const>)` created once per room); drones in `fillToCapacity` keep the 255 default.
- `server/src/game/signals.ts` -- mine + decoy `materialize` append `by: ownerId`; comment updates (Eric intel grant 2026-07-23).
- `client/src/net/connection.ts` -- send `colorPref` when a valid persisted value exists (same localStorage naming family the menu uses for name/class; no UI writes it this story).
- `client/src/config.ts` -- `colors.playerFills` (20 entries, SAME key order: 12 DESIGN hexes verbatim — cyan/lemon/magenta/azure/fuchsia/spring/iris/aqua/rose/lime/cobalt/orchid — + 8 rule-derived literals for chartreuse/olive/green/jade/lagoon/sky/periwinkle/mulberry, commented as such); `legacy` DELETES `ownHull`/`enemyHull`/`ownAssetGreen` (keeps shellCore/torpGlow/torpWake); `wake.color` removed or re-pointed (wake now dynamic).
- `client/src/util/color.ts` -- `textSafe(rgb: number): number` (WCAG contrast vs `void`, lighten toward white in small steps until ≥ 4.5:1) + contrast helper; pure, exported for tests.
- `client/src/main.ts` -- `PublicState.players.get()` gains `color?: number`; `rosterColor(g, id): number | null` (255/miss → null); thread `colors:` dep beside `names:`; own ShipView + wake recolor when own roster color is (first) known; pre-sync frames render the fallback.
- `client/src/render/ships.ts` -- style becomes per-view: `{ stroke, fill }`; `setColors(stroke, fill)` redraw path; own + contact draw = 1.5px stroke in hue + SOLID interior in fill hex; drone hull ids → `droneOutline`/`droneFill`; sunk tint multiplier unchanged.
- `client/src/render/contacts.ts` -- per-contact color resolution: drone `cls` → greys; else `rosterColor(id)` → (hue, fill); miss → amber hollow fallback.
- `client/src/render/effects.ts` -- wake dot color = own hue (setter, mirrors `setHullId`).
- `client/src/render/litZones.ts` / `mines.ts` / `decoys.ts` -- tint = firer's hue via `rosterColor(by)` for own AND enemy (drop own-green/enemy-amber split; amber only as roster-miss fallback); delete the "→ 1.12" TODOs.
- `client/src/ui/killFeed.ts` -- `killLine` returns segments (`{ text, id? }[]`); `pushKillLine` builds spans: base/connective `--hc-text-secondary` (container drops amber), names 600-weight `cssHex(textSafe(hue))`, drones `--hc-drone-outline`, mid-ellipsize > 14 chars; newest on top; keep 5 lines / 6 s TTL.
- `client/src/net/roomBindings.ts` -- `colors: (id) => number | null` dep; kill-feed call passes ids + resolved colors.
- Tests: `server/src/__tests__/regatta.test.ts` (NEW — full I/O matrix); perception invariant suite extended for `by` fields; `client/src/__tests__/tokens.test.ts` (legacy pin shrinks; playerFills: 12 verbatim pins + 8 recomputed-by-rule check; textSafe: all 20 ≥ 4.5:1, idempotent for already-passing hues); killFeed span/ellipsis tests; ships recolor test.
- Docs (same PR): `sprint-status.yaml` 1-12 → done; `_bmad-output/gds-workflow-status.yaml` next_expected → 1-13 + last_updated; `deferred-work.md` += doc-sync entries (UX-DR6 FCFS ruling; UX-DR7 propagation-set extension + mine/decoy attribution intel grant → DESIGN.md/GDD sync is Eric's, not this workflow's).

## Tasks & Acceptance

**Execution:**
- [x] `shared/` -- REGATTA_HUES + sentinel, MineView/DecoyView `by`, PV 11 -- contract first.
- [x] `server/` -- regatta.ts + schema color + colorPref sanitize + onJoin assignment + signals `by` -- authoritative assignment.
- [x] `server tests` -- regatta.test.ts matrix + invariant extension -- lock fairness/uniqueness/intel rules.
- [x] `client/src/config.ts` + `util/color.ts` -- playerFills + textSafe + legacy shrink -- derived tables before consumers.
- [x] `client render` -- ships/contacts/effects/litZones/mines/decoys recolor paths -- the visible system.
- [x] `client/src/main.ts` + `roomBindings.ts` + `connection.ts` -- rosterColor plumbing + colorPref send.
- [x] `client/src/ui/killFeed.ts` -- UX-DR17 restyle with colored name spans.
- [x] `client tests` + docs sweep + `npm run check` green (test count grew 1302 → 1332; orchestrator re-ran check: exit 0).

**Acceptance Criteria:**
- Given two humans preferring the same hue, when both join, then the earlier join holds it and the later flies the nearest free hue (circular, ascending on tie) — colors never change after assignment.
- Given a match with drones, when rendered, then every drone (roster 255) wears `droneOutline`/`droneFill` greys on water and in the feed — never a wheel hue.
- Given any sighted combatant hull (own or contact), when drawn, then stroke = its bright wheel hue and interior = its exact fill hex (12 verbatim / 8 rule-derived); own wake matches the hue.
- Given a mine, lit zone, or decoy truth-marker from firer X, when any observer sees it, then it flies X's hue (roster-joined via the new `by`), amber only when X left the roster.
- Given a sink event, when the feed line renders, then names are 600-weight in their ≥ 4.5:1 text-safe variants, connective text is text-secondary, names > 14 chars mid-ellipsize, max 5 lines / 6 s TTL, newest on top.
- Given the tokens guard scan, when the suite runs, then no color literal exists outside `config.ts` and the retired `ownHull`/`enemyHull`/`ownAssetGreen` values are gone from render/ui code.
- Given a `pv: 10` client, when it joins, then matchmake rejects it (PV 11).
- Given `npm run check`, when run, then lint + tsc ×3 + all tests pass, perception invariants included.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Eric rulings (2026-07-23, this run):** FCFS-at-join supersedes UX-DR6's "match start + fair random draw" (doc-sync deferred); wake = personal hue; ordnance = firer hue for ALL observers WITH new wire attribution (`MineView.by`/`DecoyView.by` — deliberate intel grant); derived fills + text-safe variants computed, subject to his visual pass. The AskUserQuestion answers are the authority for these four.
- **Why index-on-the-wire:** "color index rides the roster" is pinned (UX-DR6); hexes stay in the client token file so DESIGN.md remains the styling authority. The wheel ORDER becomes load-bearing (nearest-free + index→hex must agree) → promoted to shared as names-only.
- **Counter-intel safety:** decoys never render as enemy hulls (truth channel + blip lie only), so roster-joined hull tint cannot unmask a buoy; the counterIntel blip already carries the OWNER's id, so future blip coloring stays indistinguishable. DecoyView gaining `by` changes only the truesight truth channel.
- **Fill rule:** the 12 documented pairs do NOT sit exactly on a naive 45% transform (they're ~0.451) — never recompute them; the 8 missing use exact V×0.45 (HSV value scale, hue/sat preserved), authored as literals in config.ts with a test recomputing them from the rule.
- **textSafe:** DESIGN OQ#21 leaves the table open but ratifies the mechanism (`storm`→`storm-readout` pattern per hue, ≥ 4.5:1 vs void). Known-failing picks: mulberry, azure, orchid, lagoon (+ any others the math catches).
- **Own-color latency:** roster schema sync can land after the first rendered frame — own hull/wake boot on the amber/miss fallback and recolor on first roster read (sub-second, no flicker mitigation needed this story).
- Eric directive: route subagent model selection via `/orchestrate` (as 1.3–1.11).

## Verification

**Commands:**
- `npm test -w server` -- expected: green incl. regatta.test.ts + extended perception invariants.
- `npm test -w client` -- expected: green incl. tokens (playerFills/textSafe pins), killFeed, ships recolor.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green; PV bumped exactly once.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): two browser tabs — each hull flies a distinct hue with darker interior; wake matches own hue; drones grey; mines/zones/decoys wear the firer's hue; kill feed names colored, readable, ellipsized when long.
