---
status: blocked
blocking_condition: intent gaps — 11 questions for Eric before implementation
story: '7-3 How-to-Play Page'
cycle: 105
created: '2026-08-19'
baseline_revision: '362e7e7'
---

# Story 7-3: How-to-Play Page — PRE-IMPLEMENTATION QUESTIONS

Eric asked to have his hand in this one, so this is a question gate, not a spec.
Four read-only investigation agents (model-routed via `/orchestrate`) mapped the page
chrome, the shipped game facts, the boon catalog and the binding design rules. Baseline
`npm run check` is green in the worktree before any change.

**The headline: this story is mostly a COPY and TRUTH problem, not a code problem.**
The page chrome already exists (Story 7-2 minted `client/src/ui/page.ts` explicitly for
this story), the third-Vite-entry recipe is proven by `/privacy`, and the home hook is
already sitting there inert. What is NOT settled is *what the page is allowed to say* —
and several sources a naive implementer would teach from are **wrong**.

---

## ⚠️ FIRST: five things the project's own docs say that the code contradicts

These matter because the page's whole job is to tell a stranger the truth. **CLAUDE.md is
among the stale sources.** Verified directly against code, not taken on an agent's word:

| Doc claims | Shipped reality | Evidence |
|---|---|---|
| "CTRL spend window (CTRL+1/2/3, CTRL+E heal)" | **No CTRL binding exists at all** — ctrl/meta/alt are returned as native and never reach the game. Refit is **TAB (toggle)**; picks are **1–4**; **5 = DAMAGE CONTROL** | `input/keyboard.ts:97-103,350,409,489-507` |
| "slot 0 gun / 1 torpedo / 2 mine", "universal weapon fit" | **4 slots, per-class fit.** TB `[gun, torpedo, speedBoost, —]`, BS `[gun, cannon, starShells, —]`, ML `[gun, mine, decoyBuoy, —]` | `shared/src/sim/loadout.ts:122-145`, `SLOT_COUNT=4` |
| "3 upgrades from 3 distinct categories" | **4 cards from 4 distinct lines.** `rollOffer` is deleted | `constants.ts:1339` (`size: 4`) — I verified this line myself |
| Radar paints hull silhouettes with heading/speed | **Production runs `HC_RADAR_GRAMMAR=return`** — anonymous aspect-sized echoes, no heading, no speed vector, no per-captain hue. Wakes are live | `render.yaml:44-47` — I verified this myself |
| EXPERIENCE.md/UX-DR31: Q/E/R/**F** slots, SPACE-hold refit, 1–4 | **F is the FOGHORN**, SPACE is bound-inert, refit is TAB | `keyboard.ts:334-362` |

I am **not** proposing to fix the docs in this story — Story 7.6 owns doc reconciliation.
But the page must be authored from the **code**, and that is a decision worth you knowing
about rather than discovering later.

---

## Q1. "The key-chip family" — UX-DR33 assumes one family. There are four treatments. 🔴

The AC says render bindings "in the fixed bindings in the key-chip family". That family is
not single-valued:

| # | Treatment | Where | Spec |
|---|---|---|---|
| A | **Pixi chip** (the real one) | hotbar slot keys, refit digits, helm WSAD | 22×22px square, 1px phosphor @.55, mono 14px |
| B | **DOM refit-card chip** | upgrade menu digits | `22px` square, `1px solid currentColor`, `400 14px mono` |
| C | **DOM inline chip** | results buttons + **`page.ts`'s own back button** | `padding:0 5px`, 1px border, **10px**, no box |
| D | **plain mono text** | **the existing in-game controls reference**, `settings.ts:361-377` | `600 17px mono`, phosphor, no chip at all |

**They are mutually exclusive.** B is what UX-DR33 plainly means and is the DOM twin of the
real Pixi family. But D is what the game's *other* binding surface already looks like, and
picking B makes the two controls screens disagree.

**My recommendation: B** (the 22px bordered square) for the How-to-Play controls table —
it is the ratified family, and the page is a teaching surface where the chip *is* the point.
Leave `settings.ts` alone this cycle rather than restyle a shipped surface.

**Your call:** B, D, or B-plus-restyle-settings-to-match?

---

## Q2. The in-game binding reference is incomplete. Do we fix it here, or let the page be better than it?

`settings.ts:86-101` (`bindingRows()`) is labelled *"the CURRENT-TRUTH binding reference"* and
is the best source in the repo — but it is **missing**: digit `5` (DAMAGE CONTROL), the arrow-key
and numpad aliases, the fact that **the gun is slot 0 with no key at all**, and `P`.

Options:
- **(a) Fix `bindingRows()` in this same change** so both surfaces agree. *(recommended)*
- (b) Leave settings alone; the page is simply more complete. Two surfaces disagree.
- (c) Page mirrors settings exactly, gaps and all.

**Sub-question — `P`:** the netcode debug toggle (predict ⇄ interp, paints a `NETCODE:` banner)
is **not** dev-gated and ships to every player. The in-game reference omits it.
**I recommend omitting it from the taught table too** — it's a debug affordance, not a mechanic.
(Separately: it being ungated in prod is already ledgered as an NFR17 issue for the release gate.)

---

## Q3. Confirm we teach the PRODUCTION radar, not the code default.

`server/src/game/world.ts` defaults to `silhouette`/`roster`, but `render.yaml` opts production
into `return`/`pseudonym`, and Render auto-deploys `main`. So the radar a real player sees is:

- anonymous, aspect-sized **intensity echoes** — no hull silhouette, no heading, no speed vector, no personal hue
- **wakes are live** (ships *and* torpedoes leave a track; `wk` fires in `return` grammar only)
- `pseudonym` is structurally inert under `return` (that grammar puts no id on the wire at all)

Teaching silhouettes would describe a build nobody is running.

**Recommendation: teach the `return` grammar**, and word it so it survives a future env flip
(describe what you see, avoid naming the mode). **Confirm?**

---

## Q4. The boon glossary — generated from source, or hand-authored? 🔴

The AC says the page "hosts the boon glossary (Story 2.8's content)". Story 2.8 never produced a
prose glossary — **the content is the catalog itself**: 33 card lines / 9 categories in
`shared/src/sim/boons.ts`, with all player-facing copy in `client/src/ui/boonCopy.ts`.

Two complications:

1. **Card rules-text is a LIVE DIFF, not a string.** `boonDescription()` renders
   `"Radar range: 660 → 759.0. Sight, gun, cannon and star shells reach with it."` by running
   `effectiveStats()` against *your current ship*. A static page has no ship. And `STAT_LINES`
   is module-private.
2. **Story 7.5 rewrites this catalog** — cannon removed, BROADSIDE BARRAGE added, exclusivity
   removed. A hand-copied glossary is wrong two stories from now, and nothing would catch it.

Options:
- **(a) Generate from `BOON_CATALOG` + `boonCopy.ts` at render time** *(recommended)* — stays
  correct through 7.5 automatically. Needs a small new export from `boonCopy.ts`.
- (b) Hand-author flavor prose. Goes stale at 7.5, silently.
- (c) Names + categories only, no rules text.

**If (a): what number do we show?** A card's effect differs per hull and per stack position.
Cleanest honest answer is **the first copy's effect on a base hull of each class**, or
**no numbers at all** (name + category + rarity + what it does in words). I lean
**name + category + rarity + first-copy effect**, but the numbers question is a design call.

---

## Q5. Page weight — the shared barrel has no narrow entry point.

`shared/package.json` exports only `"."`, so importing the catalog into a standalone page pulls
**the entire barrel**: mapgen, gradient noise, height field, radar shadow, ballistics, collision.
A glossary page has no use for any of it.

Headroom is comfortable (7-2 measured ~310.8 kB gz with **~7.7 s** of NFR2 budget spare), so this
is not urgent — but it is avoidable.

- (a) Accept it and measure with `loadCapture.mjs`. *(fine)*
- **(b) Add a narrow subpath export (`"./sim/boons"`) to `shared/package.json`.** *(recommended — cheap, and 7.5 benefits)*
- (c) Generate a static JSON at build time.

---

## Q6. Ad slot: I recommend 7-3 ships NONE. Confirm?

The AC says the page "**may** carry one display unit (per 7.4)". Findings:
- **DESIGN.md contains nothing about ads at all** — no token, no component, no layout reservation.
- The page is a `position:fixed; inset:0` centred 1100px column with its own scroll. 7-2's R14
  already ruled on exactly this shape: *"reserving space for one inside the other converts a
  covering bug into an overflow bug without fixing anything."*
- 7.4 owns ads and lands after this.

**Recommendation: no ad slot now.** 7.4 places it with the rest of the ad layout.

---

## Q7. Two inherited `page.ts` defects + one missing helper.

Already ledgered in `deferred-work.md` naming 7-3 as the inheritor:

1. **No link helper.** `makePageParagraph` uses `textContent`, so the privacy page renders its own
   URLs as dead plain text. **The 7-3 AC requires a privacy-policy link**, so a `makePageLink` has
   to exist. *(must do)*
2. **`renderPage`'s capture-phase ESC listener is never disposed** — `mountPrivacyPage()` discards
   the handle, so `destroy()` is unreachable. Harmless for a standalone document; a live hazard the
   moment the chrome is used as an overlay. Also no double-mount guard.

**Recommendation:** do (1) because the AC forces it, and (2) while already in the file — both are
small. **Confirm you want (2) in this cycle** rather than left ledgered.

---

## Q8. Home's HOW TO PLAY link — make it a real anchor?

Today it is a `<span>` with a click handler that paints
`FIELD MANUAL ARRIVES IN A LATER REFIT` (`home.ts:88`) and navigates nowhere.
Its sibling PRIVACY is deliberately a real `<a href="/privacy">` — pinned by a test whose comment
says the anchor is *load-bearing for AdSense site review*, not cosmetic.

**Recommendation:** make HOW TO PLAY a real `<a href="/how-to-play">` matching PRIVACY, delete
`NOTE_HOWTO`, and update the `home.test.ts` stub pin. **Confirm.**

---

## Q9. Copy authorship — the whole page is unratified copy. 🔴

Amendment 41 is standing project law: *"a ruling to put information somewhere is NOT a licence to
author the copy that goes there. When a state seems to need words that were not ruled, the answer
is to leave it empty and ask."*

This page is **nothing but** words that were not ruled. Leaving it empty is not an option — it's a
beta gate.

**Recommendation — the privacy-policy precedent (R9):** I draft the full page from verified code
facts in the terse-naval register, you do a copy pass, then it freezes the way `taglines.ts` is
frozen. **Confirm that process.**

**And one sentence needs your word specifically — the win condition.** This page exists partly to
close epic-5 amendment 46(c) (*"the win condition is stated nowhere a new player can read"*), and
you already ruled on 2026-08-14 that the copy **moves to HOW TO PLAY**. The only surviving
statement in the product is winner-only (`results.ts:159`).

Proposed line, matching the README and the retired home tagline: **`LAST HULL FLOATING WINS.`**

Note the precise shipped truth it has to summarize: *last **participant** floating* — where
participants are human captains **and AI captains**, but **not** PvE fleet hulls. **A bot can
legitimately win**, and the results modal names it. Do you want that nuance on the page, or just
the clean line?

---

## Q10. Structure and depth — one long page?

AC sections: controls · three sensor tiers · storm rhythm · classes + slot grammar · boon economy ·
boon glossary · win condition · Solo vs AI as the live tutorial · privacy link.

With a 33-line glossary that is a **long** single-column scroll at 1100px. Alternatives: collapse
the glossary behind a disclosure, or split it to its own page.

**Recommendation:** one page, glossary last, since the AC says the page *hosts* it and the panel
already owns its own `overflow-y:auto`. **Confirm, or ask for a different shape.**

---

## Q11. Standalone page only, or also reachable in-match?

`page.ts` was deliberately built to serve either, and says the choice is 7-3's.

**Recommendation:** standalone third Vite entry at `/how-to-play` only — exactly mirroring
`/privacy`. No in-match surface, no settings-overlay entry point. (This also keeps Q7's ESC-listener
hazard purely theoretical.) **Confirm.**

---

## What I will do once you answer

Nothing here needs new game mechanics, wire changes, or a `PROTOCOL_VERSION` bump — **PV stays 40**.
Planned shape: a third Vite entry (`client/how-to-play/index.html` + `src/how-to-play/main.ts` +
a copy-as-data module), a `makePageLink` and a controls-table/key-chip helper in `ui/page.ts`, the
home link rewired, the `analytics.test.ts` third-party-script guard extended to the new page, and
tests matching `page.test.ts`'s established pins. Version → `0.17.105`; both tracker files updated
in the same PR.

## Notes of record

- **Baseline is green:** full `npm run check` passes in the worktree (exit 0) before any change.
- **Two investigation agents hit a worktree-guard failure** — their Bash resolved to the shared
  checkout while this session is isolated, and `EnterWorktree` refused with a contradictory message.
  Neither worked around it destructively; both completed via read-only tools, and I independently
  re-verified the load-bearing claims (`render.yaml` radar env, `offer.size`, the binding table,
  `checkWin`). Surfacing it per your standing instruction rather than stepping past it. **My own
  Bash and the baseline check worked fine**, so this did not block the investigation.
- **Stale in-code comments found in passing** (not fixed, not in scope): `chromeBar.ts:203-210`
  (KILLS/drones), `stats.ts:29-30` (retired mine-trigger clamp), `loadout.ts:7-8` (fleet "universal
  fit"), `constants.ts:1138` (prop-fouling damage cut, deleted cycle 95), `perception.ts:10-13`
  (exception list omits `sunk` — the count is six), `index.ts` PV changelog stops at 37 while the
  constant is 40. Happy to sweep these here or leave them for 7.6.
