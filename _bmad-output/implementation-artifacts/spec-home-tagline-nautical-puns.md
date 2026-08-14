---
title: 'Home Tagline — a random nautical pun replaces LAST HULL FLOATING WINS'
type: 'chore'
created: '2026-08-14'
status: 'ready-for-dev'
baseline_revision: 'f5d705de2e7d09917d342af7a0f6b705834160aa'
final_revision: ''
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/project-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** The home page wordmark carries one fixed tagline, `LAST HULL FLOATING WINS`
(`client/src/ui/home.ts:230`). Eric wants a random nautical pun in that slot instead — a
wink before the match, different each time you come to port.

**Approach:** Client-only chrome change. A new pure module owns a frozen 20-entry pun pool
and a `pickTagline()` that draws uniformly from it; `makeWordmark()` calls it in place of
the literal. No other home chrome, geometry, or flow moves.

## Eric rulings this run (AskUserQuestion, 2026-08-14)

1. **Register: MIXED.** One pool holding both broad groaners and dry naval gallows wit,
   drawn from as a single set. (Options offered: dry-wit-only, groaners-only, mixed.)
2. **Cadence: a new pun on every return to port** — reroll on mount AND on each return
   from a match. (Options offered: once per page load, rotate on a timer, per return to
   port.) *Implementation note: `returnToPort()` is a full `location.reload()`
   (`client/src/main.ts:1422` → `app/returnToPort.ts`), so a pick made at `makeWordmark()`
   time satisfies this ruling with no extra machinery. The rotate-on-a-timer option was
   offered and NOT taken — do not add motion to this slot.*
3. **The win-condition line is fully replaced.** `LAST HULL FLOATING WINS` leaves the home
   page entirely; it does NOT stay in the rotation and is NOT kept as a second line. HOW TO
   PLAY carries the rule now. (Both alternatives — keep-the-rule-add-a-line, and
   rule-joins-the-pool — were offered and declined.)
4. **The list is Eric-approved copy, verbatim.** He reviewed the 20 entries and took them
   as drafted. Two further candidates, `WHAT A LOAD OF SHIP` and `LET'S GET SHIPFACED`,
   were offered and **EXCLUDED** — do not add them back.

## The approved pool (20, verbatim — copy is Eric's, not the implementer's)

```
SEAS THE DAY
WATER YOU WAITING FOR?
HULL OF A GOOD TIME
OH BUOY, HERE WE GO
PIER PRESSURE
SHIP HAPPENS
NAUTI BY NATURE
FOR FLOAT'S SAKE
RUDDER NONSENSE
KEEL WELL SOON
SINK OR SWIM. MOSTLY SINK.
ALL HANDS ON DECK. BRIEFLY.
ABANDON SHIP RESPONSIBLY
YOUR HULL, THEIR PROBLEM
WE HAVE A SINKING FEELING
BUOYANCY IS TEMPORARY
NO SHIP LASTS FOREVER
THE SEA ALWAYS COLLECTS
SOMEONE HAS TO SINK FIRST
DAMAGE CONTROL IS A MINDSET
```

## Boundaries & Constraints

**Always:**
- **Client-only.** No `shared/` or `server/` change, no wire field, `PROTOCOL_VERSION`
  unchanged at 36. This is chrome on a pre-join DOM overlay.
- **The strings are Eric's copy and travel verbatim** — exact casing, punctuation and
  apostrophes as listed above. An implementer may not reword, re-order for "flow", trim
  the pool, or invent additions. Typographic apostrophes are NOT to be substituted (the
  pool uses ASCII `'`, matching the rest of the client's copy).
- `Math.random` is legal here — this is client chrome, not sim code — following the
  established precedent in `spec-home-page-maintenance.md` (the random colour pick). The
  RNG source must be **injectable** so tests are deterministic.
- The tagline keeps its existing style verbatim: `registerCss('label')`,
  `color:var(--hc-phosphor)`, `letter-spacing:0.44em`, `margin-top:8px`. No new tokens, no
  new colours, no per-player hue.
- **Amendment 47 (the container-fit law) binds.** The wordmark sits in the rigid port
  column measured at ~668px. The pun replaces one line with one line, so column HEIGHT is
  unchanged by construction — but the longest entry is 27 chars against the old 23, so the
  slot gets WIDER. At `registerCss('label')` size with 0.44em tracking the worst case stays
  well inside the 1366px floor; a test pins the pool's max length so a future addition
  can't silently break it.
- **Amendment 15 (type ≥14px floor) and amendment 17 (no grey load-bearing text)** are
  untouched — the register is unchanged.
- No motion. The rotate-on-a-timer option was declined; adding animation here would also
  put a new claim on the photosensitivity budget and need Story 4-8 attention-tier
  arbitration.

**Block If:** any task turns out to need a `shared/` or `server/` change; or a copy
decision surfaces that the four rulings above do not already answer.

**Never:** No second tagline line. No keeping `LAST HULL FLOATING WINS` in the pool. No
adding the two excluded crude entries. No editing `results.ts:75` (`LAST HULL FLOATING —
YOU WON` is the WIN banner, a different string in a different surface, and stays). No
design-doc edits — the stale mockup line is ledgered instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Home mount | `showHome()` builds the overlay | Tagline is one of the 20 pool entries, drawn uniformly | No error expected |
| Return to port | Results → RETURN | Full `location.reload()` → fresh module state → fresh pick | No error expected |
| Repeat visits | Player refreshes N times | Picks vary; every entry is reachable | No error expected |
| Deterministic test | Injected `rand` returning k/20 | Returns pool[k] exactly | No error expected |
| `rand()` returns 1.0 | Degenerate RNG (spec allows [0,1)) | Index clamped to last entry, never `undefined` | Clamp, no throw |
| Pool edited later | A contributor adds a 21st entry | Guard tests fail if it is lowercase, empty, over the length cap, or a duplicate | Test failure |

</intent-contract>

## Code Map

- `client/src/ui/taglines.ts` — **NEW.** `HOME_TAGLINES` (frozen 20-entry array) +
  `pickTagline(rand = Math.random)`. Pure, zero imports, no DOM.
- `client/src/ui/home.ts:229–231` — `makeWordmark()`; the `tagline.textContent` literal
  becomes `pickTagline()`. Style line untouched.
- `client/src/__tests__/taglines.test.ts` — **NEW.** Pool invariants + pick determinism.
- `client/src/__tests__/home.test.ts` — add a pin that the rendered tagline is a pool
  member and that the old literal is gone from the home overlay.
- `VERSION` + `package.json` — 0.17.86 → 0.17.87 (cycle 87).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — interstitial cycle index
  line for cycle 87, plus a one-line interstitial entry.
- `_bmad-output/gds-workflow-status.yaml` — `last_updated` / `next_expected` stamp.
- `_bmad-output/implementation-artifacts/epic-5-context-amendments.md` — Amendment 46
  recording the four rulings.
- `_bmad-output/implementation-artifacts/deferred-work.md` — doc-sync entry: the UX mockup
  `home-class-picker-1.html` (lines 308, 406) still shows "Last hull floating wins" as the
  tagline; mock-era content, now stale.

## Tasks & Acceptance

### Task 1 — the pun module
Create `client/src/ui/taglines.ts` exporting `HOME_TAGLINES` (the 20 approved strings,
verbatim, frozen) and `pickTagline(rand: () => number = Math.random): string` that indexes
uniformly and clamps the degenerate `rand() === 1` case.

- **Given** the module is imported, **when** `HOME_TAGLINES` is read, **then** it holds
  exactly the 20 approved strings in the spec's order and is frozen.
- **Given** an injected `rand` returning `k / 20` for k in 0..19, **when** `pickTagline` is
  called, **then** it returns `HOME_TAGLINES[k]`.
- **Given** an injected `rand` returning `1`, **when** `pickTagline` is called, **then** it
  returns the last entry rather than `undefined`.

### Task 2 — wire it into the wordmark
In `client/src/ui/home.ts`, replace the `LAST HULL FLOATING WINS` literal at :230 with
`pickTagline()`. Leave the element, its style string, and its position in the wrap
unchanged.

- **Given** the home overlay is mounted, **when** the tagline element is read, **then** its
  text is a member of `HOME_TAGLINES`.
- **Given** the home overlay is mounted, **when** the overlay's text is searched, **then**
  `LAST HULL FLOATING WINS` does not appear anywhere in it.
- **Given** the wordmark, **when** its children are inspected, **then** it is still exactly
  `[mark, tagline, ver]` and the tagline still carries `letter-spacing:0.44em` and
  `var(--hc-phosphor)`.

### Task 3 — pool guard tests
Add `client/src/__tests__/taglines.test.ts` pinning the invariants a future edit could
break.

- **Given** the pool, **when** each entry is checked, **then** every entry is non-empty,
  equal to its own `toUpperCase()`, has no leading/trailing whitespace, and is ≤ 28
  characters (the container-fit headroom pin — the longest approved entry is 27).
- **Given** the pool, **when** it is de-duplicated, **then** the set size equals the array
  length.
- **Given** the pool, **when** it is searched, **then** it contains neither
  `LAST HULL FLOATING WINS` (ruling 3) nor either excluded crude entry (ruling 4).

### Task 4 — version + trackers
Bump `VERSION` and `package.json` to 0.17.87. Add the cycle-87 line to the sprint-status
interstitial cycle index and a one-line interstitial entry; stamp
`gds-workflow-status.yaml`. Both tracker files must move in this same PR.

- **Given** the landed branch, **when** both tracker files are diffed, **then** each
  carries a cycle-85 stamp and neither carries narrative beyond one line.

### Task 5 — the durable record
Append Amendment 45 to `epic-5-context-amendments.md` recording the four rulings (mixed
register, per-return cadence with the timer option declined, full replacement of the win
line, and the approved-verbatim pool with its two exclusions). Add the mockup doc-sync
entry to `deferred-work.md`.

- **Given** the amendments file, **when** Amendment 45 is read, **then** all four rulings
  and both excluded strings are recorded with their date and source.

## Verification

- `npm run lint` clean (complexity ≤ 10).
- `npm run check` green — all existing tests plus the new ones.
- The change is client-only: `git diff --stat` touches no `shared/` or `server/` file, and
  `PROTOCOL_VERSION` is unchanged at 36.
