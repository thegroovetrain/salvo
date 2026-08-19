---
status: answered
---

# BMad Dev Auto Result — Story 7-4 (AdSense H5 Games Ads)

Status: ANSWERED 2026-08-19 — six Eric rulings taken at the gate; see "THE ANSWERS" below.
Original blocking condition: intent gaps — four decisions were Eric's, not an implementer's

## THE ANSWERS (Eric, 2026-08-19)

- **A1 — GOOGLE'S OWN CMP.** `adsbygoogle.js` loads for everyone, pre-consent, and Google's
  dialog asks the consent question. This is the only option that unlocks personalized ads in
  the EEA/UK/CH. Consent Mode BASIC (R7) is RETIRED.
- **A2 — INTERSTITIAL ONLY. NO DISPLAY UNITS ANYWHERE.** The home display-unit clause of the
  Story 7.4 AC and of NFR8 is struck; no unit ships on home, How-to-Play or Privacy. This
  removes the unsatisfiable 150 px clause and the reload-impression suspension risk in one cut.
- **A3 — ADS.TXT SNIPPET** for site verification.
- **A4 — BUILD THE INTERSTITIAL NOW, DORMANT**, gated on the publisher ID being set at build time.
- **A5 — DELETE THE OWN CONSENT CARD.** Google's CMP becomes the single consent dialog, covering
  ads AND analytics. Outside Europe no dialog appears and analytics simply runs. The settings
  PRIVACY toggle (R15) SURVIVES as the way to change your mind.
- **A6 — THE H5 GAMES ADS APPLICATION IS ALREADY SUBMITTED**, awaiting approval. It is the one
  dependency this cycle cannot shorten.

- **A7 — THE PUBLISHER ID IS `pub-8667818947296707`** (Eric, 2026-08-19). Therefore:
  - `ads.txt` carries exactly `google.com, pub-8667818947296707, DIRECT, f08c47fec0942fa0`
  - the loader client ID is `ca-pub-8667818947296707`
  - it rides `render.yaml` as a build-time var beside `VITE_GA_MEASUREMENT_ID`, whose own comment
    establishes the precedent — *"Not a secret: … committed deliberately, so that 'which property
    does production report to' is answerable by reading the repo."* A publisher ID is public by
    construction: it is published in `ads.txt`.
  - `ads.txt` is still emitted ONLY when the ID is present in the environment, so a fork or a
    local build produces no file. An `ads.txt` naming the wrong ID is strictly worse than none —
    once published it is authoritative by omission.

Baseline: `60db0b2` (0.17.106, PROTOCOL_VERSION 41). Worktree `dev-auto-7-4-adsense`.
Investigation: three parallel agents (ad seam, consent + page real estate, external AdSense research).

---

## What is already done and needs no decision

- **The ad seam is ready.** `requestAdBreak()` is already awaited in the right place
  (`client/src/app/returnToPort.ts:80`), after `onStart` and before `leaveRoom()`, wrapped by
  `safeAdapter`'s 35s cap and a `settle()` that swallows rejections. Story 7.4 swaps ONE line at
  `client/src/main.ts:4893`. No chain surgery.
- **The never-strand-the-player contract already holds** and is pinned by tests
  (`returnToPort.test.ts:118,137`). Research confirms it is load-bearing: if `adsbygoogle.js` is
  blocked, `adBreak()` degrades to an inert `Array.push` and **no callback fires at all, including
  `adBreakDone`** — Google documents nothing about ad blockers. Our timeout is the only backstop.
- **7-2 already pre-paid a prerequisite**: the PRIVACY link is a real crawlable `<a>` specifically
  because AdSense site review needs a reachable policy URL (`ui/home.ts:711`).
- **Runtime script injection satisfies the existing guard test** with no test edits, following the
  ratified `analytics/ga.ts` pattern (origin named once, ID from a build-time `VITE_*` var, `async`,
  swallowed `onerror`, started/ready latches).

## What is NOT true and should be corrected in the epic record

`epic-7-context.md` states *"The 150 px clearance and the natural-transition-point restriction are
Google policy, not preference."* **Half of that is wrong.**

- *Natural transition points* IS policy, quotable and prohibitive
  (https://support.google.com/publisherpolicies/answer/11975916 — full-screen ads *"that interrupt
  the user during periods of continuous game play"* are prohibited).
- *150 px* is a **recommendation**, and it is written in Flash-era language:
  *"We recommend that AdSense for content ad units be placed at least 150 pixels away from the
  game"* (https://support.google.com/adsense/answer/2768340) and *"we strongly recommend a distance
  of at least 150 pixels"* under the heading **"Distance between ads and Flash games"**
  (https://support.google.com/adsense/answer/1346295). No modern canvas/HTML5 restatement was found.
  The real enforcement mechanism is invalid-click detection, not a numeric pass/fail.

This matters because the AC's 150 px clause is currently unsatisfiable on home (see Q2) — and it is
a recommendation we are failing, not a policy we are violating.

---

## THE FOUR QUESTIONS

### Q1 — Does Google's ad code load before someone clicks ACCEPT? (the money question)

**The conflict, in plain terms.** Our consent card carries FROZEN copy that promises
*"nothing loads until you accept"* (`ui/consentBar.ts:75`). That promise is Consent Mode BASIC,
your own ruling R7. For ads to show, Google's `adsbygoogle.js` has to load. So the promise and the
ads collide.

It gets worse: **Google's own free CMP cannot be used behind our banner at all.** It has no
standalone script — it is delivered BY `adsbygoogle.js`
(https://developers.google.com/funding-choices/fc-api-docs, and AdSense's own help says *"the
AdSense code needs to be located on the page"* for messages to display). So *"nothing loads until
Accept"* and *"use Google's certified CMP"* are mutually exclusive. Story 7.2 deferred the CMP to
this story assuming they would compose. They do not.

**Correction to a common misreading, verified:** having no certified CMP does **not** stop ads in
Europe. *"Traffic from a non-certified CMP may be eligible for non-personalized ads or limited ads"*
(https://support.google.com/adsense/answer/13554116). The cost is personalization revenue in
EEA/UK/Switzerland only, not a blackout.

**Options:**

- **A — Keep the promise.** Ad code loads only after ACCEPT. Anyone who declines or ignores the
  banner sees no ads, worldwide. Banner copy gains one clause naming ads. No Google dialog, one
  banner, R7 intact. **Lowest revenue.**
- **B — Load ads for everyone, non-personalized by default.** Ad code loads pre-consent; ads are
  non-personalized unless the player accepts (and personalized only outside EEA/UK/CH, since we
  have no certified CMP). The frozen *"nothing loads until you accept"* clause is **retired** and
  rewritten. **Highest revenue. Breaks R7's promise.**
- **C — Adopt Google's own CMP.** Ad code loads pre-consent and Google's dialog asks the consent
  question. Unlocks personalized ads in Europe. It is Google's dialog (colours/fonts/language
  configurable, not our design system), and it risks two dialogs unless our banner is cut back to
  analytics-only or removed. **Highest revenue in Europe, least control of the first thing a new
  player sees.**

Not an implementer's call: it trades a promise you personally ruled against money.

---

### Q2 — Where do the display ads actually go? (the AC is unbuildable as written)

**The AC says display units go on home, ≥150 px clear of the game canvas. On home that distance is
zero everywhere, and cannot be made non-zero without moving ratified anatomy.**

- `client/index.html:34` — `#app { position: fixed; inset: 0 }`. The Pixi canvas IS the whole
  viewport and is never resized or letterboxed.
- Since cycle 82 that canvas renders a **live ambient scene** behind home — real terrain, real
  radar with height shadows and wakes, real hulls on real kinematics (`render/ambient.ts:1-20`).
  It is game content, not a backdrop.
- The centred home column measures **~688 px against the 768 px ratified floor** (UX-DR39) — about
  40 px of total vertical slack. There is nowhere to put a band without moving something ratified.

**And there is a second, more serious reason to keep ads off home.** RETURN TO PORT ends in
`location.reload()` (`app/returnToPort.ts:82`), so **home re-renders on every single match end**.
A display unit there would mint a fresh impression for the same player, over and over, all session.
Google on invalid traffic: publishers *"should refrain from inserting ads in auto-refreshing
placements"*, and *"if Google observes high levels of invalid traffic on an account, they may
suspend or close the account"* (https://support.google.com/adsense/answer/16737,
https://blog.google/products/adsense/understanding-account-suspensions-due/). A user-initiated
reload is arguably not auto-refresh — but **no Google document draws that line**, and the downside
is account suspension on an account you have held for years.

**Options:**

- **A — How-to-Play page only.** No canvas on that page at all (separate Rollup entry, no Pixi, no
  socket). Fully compliant for free, zero geometry risk, no reload problem. **Least revenue —
  almost nobody visits it.**
- **B — How-to-Play + Privacy.** Marginally more inventory. Ads on a privacy policy page read
  poorly and Google's thin-content rule (*"more ads than publisher-content"*) is a live risk on both
  short pages.
- **C — Make room on home.** Either blank/stop the ambient scene while an ad is up, or letterbox the
  canvas to carve a real band. Real work (`index.html`, Camera/Fog resize, corner anatomy), real
  design risk at 1366×768, and it does NOT solve the reload-impression problem.
- **D — Interstitial only, no display units anywhere.** Cleanest and safest; the interstitial is
  where the money is in H5 games anyway. Drops one AC clause outright.

---

### Q3 — Which site-verification method? (you said you have all three ready)

**Recommendation: the Ads.txt snippet.** Reasons:

1. **It loads no Google script**, so it does not touch Q1 at all — verification works the same
   whichever way you rule on consent.
2. **It survives the 7.7 split unchanged.** It is a file at the domain root today (served out of
   `client/dist`) and a file at the domain root after the client becomes a CDN static site.
3. **You want it anyway.** Google recommends it independently, and the file also authorizes Google
   as a seller. Using it for verification is one artifact doing two jobs.
4. The Meta tag is a fine second choice (also inert, no script) but it is verification-only — it
   does nothing after approval, and it has to live in `index.html`.
5. **The AdSense code snippet is the one to avoid for verification**, because it IS
   `adsbygoogle.js`. If Q1 lands on option A (gate it behind ACCEPT), the crawler may see a page
   without it. Google does not document whether the check is crawler-side or client-side —
   **stated unknown**, and avoidable.

One warning either way: `ads.txt` is advisory *until you publish one*, after which it becomes
authoritative by omission — *"Domains hosting an ads.txt file where the seller's publisher ID isn't
listed are no longer monetized"* (https://support.google.com/adsense/answer/9785052). **A typo'd
ads.txt is strictly worse than no ads.txt.** I will need your exact `pub-XXXXXXXXXXXXXXXX` ID, and
the line will read `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`.

Note: there is no `client/public/` directory and `express.static` has no catch-all, so the file
needs a real mechanism (a new Vite `publicDir`, or an express route). Small task either way.

---

### Q4 — H5 Games Ads: have you applied, and do we build the interstitial now?

**H5 Games Ads is a separate application on top of your approved AdSense account**, and approval is
explicitly not guaranteed: *"This is a by-application product"* /
*"Account approval is not guaranteed as it is subject to partner eligibility"*
(https://developers.google.com/ad-placement/docs/signup,
https://support.google.com/adsense/answer/1705831). **There is no published timeline**, and the
"approved for display, still waiting on H5" state can persist indefinitely.

Confirmed alive, not deprecated: the signup doc carries a **"Last updated June 18, 2026"** stamp,
and no sunset or migration notice exists anywhere in the surface.

- **A — Build it now, dormant.** The adapter ships and stays inert until the publisher ID is set at
  build time. Costs nothing to ship early; the seam already exists. Turning it on later is a
  client-only redeploy, exactly as the epic anticipates.
- **B — Wait for approval, do display units only this cycle.**

**Please also confirm whether the H5 application has been submitted**, since its latency is the one
dependency this cycle cannot shorten.

---

## Implementer rulings I will take myself unless you say otherwise

These are mechanism, not product, so they do not need you — recorded here so they are visible:

1. **Interstitial placement type is `'next'`.** Google's own sample fires exactly this shape
   (`type: 'next', name: 'restart-game'`), and death→return-to-port is a restart.
2. **Audio muting builds a transient duck that bypasses the settings store.** Today the only mute
   lever is `settings.set({muted})`, which **persists to localStorage** — a naive mute/unmute would
   either strand a player permanently muted if the page dies mid-break, or un-mute someone who had
   muted themselves. The duck saves and restores around `beforeAd`/`afterAd`, and `adConfig({sound})`
   reports the player's real mute state.
3. **The ad layer mirrors `analytics/`**: a `client/src/ads/` directory, vendor origin named once,
   publisher ID from a build-time `VITE_ADSENSE_CLIENT` var (never a literal, so a fork or a local
   build is inert — the `VITE_GA_MEASUREMENT_ID` precedent in `render.yaml`), dynamic injection,
   swallowed `onerror`, callback-wired UI that never imports the ads layer.
4. **Any home-mounted ad surface (if Q2 lands on C) is torn down at `main.ts:4647`** alongside the
   consent card, and carries no inline `visibility` — cycle 105 exists because a home descendant
   escaped the settings yield.
5. **Return-to-port is never gated on `adBreakDone`** — see the blocked-script hazard above.

## Copy that will need your approval once Q1 lands

Per the R9 mould (implementer drafts from verified facts, you approve, then it freezes):

- **The consent card notice** (`ui/consentBar.ts:75`, currently frozen) names Google Analytics only
  and promises nothing loads until Accept. Both clauses change under any Q1 option.
- **The privacy policy** must gain Google's mandated ad disclosures: that third-party vendors
  including Google use cookies to serve ads based on prior visits, and a pointer to Ads Settings for
  opting out of personalized advertising (https://support.google.com/adsense/answer/1348695).
  This is a hard AdSense requirement, not a nicety.

## Two doc drifts found in passing (not this story's work)

- `CLAUDE.md:82` says `PROTOCOL_VERSION` is "currently 40". It is **41** since Story 7-3.
- `sprint-status.yaml:218` still shows `7-3-how-to-play-page: in-review` although PR #171 merged.
