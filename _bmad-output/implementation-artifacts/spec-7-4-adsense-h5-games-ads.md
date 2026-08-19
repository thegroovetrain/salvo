---
title: 'Story 7-4: AdSense H5 Games Ads'
type: 'feature'
created: '2026-08-19'
status: 'done'
baseline_revision: '60db0b2'
final_revision: '12c7578'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-7-4-adsense-questions.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The game earns nothing. The `PortalAdapter` seam has carried a null implementation
since Epic 0 waiting for this story, and Story 7.2 deliberately left the three ad consent signals
denied with a comment naming 7.4 as the story that widens them. Meanwhile the story's own AC is
partly unbuildable: it asks for display units on home ≥150 px clear of the game canvas, but the
canvas is `position:fixed;inset:0` and renders a live ambient scene behind every pixel of home.

**Approach:** Ship the interstitial ONLY (Eric A2 — no display units anywhere), adopt Google's own
certified CMP as the single consent dialog (Eric A1/A5 — the self-built consent card is deleted),
verify the site by `ads.txt` (Eric A3), and move analytics from Consent Mode BASIC to ADVANCED,
which adopting the CMP forces because the CMP is delivered by the ad script itself.

## Boundaries & Constraints

**Always:**
- Game code never imports an ad SDK. Only `client/src/ads/**` may name the vendor, mirroring the
  ratified `analytics/ga.ts` discipline: origin named once, client ID from a build-time `VITE_*`
  var and never a literal, `async`, swallowed `onerror`, separate started/ready latches.
- The never-strand-the-player contract holds unconditionally. Return-to-port is NEVER gated on
  `adBreakDone` — if `adsbygoogle.js` is blocked, `adBreak()` degrades to an inert `Array.push`
  and no callback fires at all. `safeAdapter`'s 35 s cap plus `settle()` remain the only backstop.
- `gtag('consent','default',…)` must execute before any other Google script on the page. The
  region-scoped EEA/UK/CH default and the global default both ship, and the build-injected region
  list is pinned by test against `EEA_UK_CH_REGIONS` in `analytics/consent.ts` — one list, two
  consumers, never two hand-maintained copies.
- `ads.txt` is emitted ONLY when the publisher ID is present in the environment. A published
  `ads.txt` is authoritative by omission, so a wrong or partial one is strictly worse than none.
- Audio restore must survive the break. The mute duck is TRANSIENT and must not write the settings
  store — `settings.set({muted})` persists to localStorage, so a naive mute/unmute either strands a
  player muted forever if the page dies mid-break or un-mutes someone who muted themselves.

**Block If:**
- Any change would put an ad surface inside a live match, or make the interstitial fire anywhere
  but death→return-to-port.
- The privacy policy would ship a claim not checked against code (amendment 14's standing rule: a
  privacy policy that misstates collection is a defect, not a wording preference).

**Never:**
- No display ad units, on any page. No home ad surface, no letterboxing of the canvas, no change
  to the ambient scene, no movement of ratified corner anatomy.
- No `PROTOCOL_VERSION` change — nothing on the wire moves.
- No geo lookup is added anywhere. Region scoping is Google's, resolved server-side from the
  request, exactly as amendment 14 R6 established.
- No second consent dialog. Google's CMP is the only one.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ad configured, ad fills | Publisher ID set, player presses RETURN TO PORT | Audio ducks, interstitial plays, audio restores to its PRE-BREAK value, chain proceeds to leave+reload | No error expected |
| Ad configured, no fill | `adBreakDone` fires with `breakStatus` in {`noAdPreloaded`,`frequencyCapped`,`other`} | No duck (no `beforeAd`), chain proceeds immediately | Status recorded, never surfaced to the player |
| Script blocked | Ad blocker or offline; `adsbygoogle` stays a plain Array | NO callback ever fires; `safeAdapter`'s 35 s cap resolves and the chain reloads | Swallowed; game unaffected |
| Not configured | `VITE_ADSENSE_CLIENT` unset (dev, fork, local build) | Null adapter; no script, no `ads.txt`, no consent defaults injected; byte-identical to today | No error expected |
| Player muted themselves | `settings.muted === true`, break fires | Duck is a no-op in effect; after `afterAd` the player is STILL muted | Restore reads the pre-break value, never a constant |
| Page dies mid-break | Tab closed between `beforeAd` and `afterAd` | Persisted mute setting is UNCHANGED, because the duck never wrote it | Structural, not handled |
| EEA visitor | Google CMP shown on `index.html` | CMP issues `consent update` itself; analytics unlocks only if Eric ticked both dashboard flags | Untickled flags ⇒ stays denied (fails safe) |
| Non-EEA visitor | No dialog shown anywhere | Global default governs: analytics granted, ads granted | No error expected |
| Local analytics opt-out | Settings → PRIVACY → ANALYTICS off | `consent update` denies `analytics_storage`; events stop dispatching; persisted locally | Survives reload |

</intent-contract>

## Code Map

- `client/src/portal/portalAdapter.ts` -- the seam; interface UNCHANGED, five methods
- `client/src/portal/safeAdapter.ts` -- 35 s cap + throw/rejection swallow; UNCHANGED
- `client/src/app/returnToPort.ts` -- already awaits `requestAdBreak()` at :80; UNCHANGED
- `client/src/main.ts:4893` -- the one construction site; swaps null → AdSense adapter
- `client/src/main.ts:4480,4647` -- consent card mount + deploy-door teardown; both DELETED
- `client/src/ads/` -- NEW: vendor-owning loader + `PortalAdapter` implementation
- `client/src/audio/context.ts` -- gains the transient duck
- `client/src/analytics/consent.ts` -- BASIC → ADVANCED defaults; `EEA_UK_CH_REGIONS` reused
- `client/src/analytics/index.ts` -- activate at boot; queue retired; local override semantics
- `client/src/ui/consentBar.ts` + `__tests__/consentBar.test.ts` -- DELETED (~575 lines)
- `client/src/ui/settings.ts` -- PRIVACY row SURVIVES; `hideConsentBar` call removed
- `client/src/config.ts:1516` -- `consent` block reduced to `policyHref` (home's link needs it)
- `client/vite.config.ts` -- NEW plugin: emits `ads.txt`, injects head scripts, only when configured
- `client/privacy/policyCopy.ts` -- Google's mandated ad disclosures
- `render.yaml` -- `VITE_ADSENSE_CLIENT: ca-pub-8667818947296707`

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- append Amendment 16 recording all seven Eric rulings and the supersessions -- durable home; the context file is regenerable
- [x] `client/src/ads/adsense.ts` -- NEW: vendor module. `AD_SCRIPT_SRC` named once; client ID from `VITE_ADSENSE_CLIENT`; `isAdsConfigured()`; `adConfig`/`adBreak` shim; started/ready latches; swallowed `onerror` -- the only file that names the vendor
- [x] `client/src/ads/adsAdapter.ts` -- NEW: `PortalAdapter` impl. `requestAdBreak()` → `adBreak({type:'next', name:'return-to-port', beforeAd, afterAd, adBreakDone})`, resolving on `adBreakDone` -- Google's own sample uses exactly this shape
- [x] `client/src/audio/context.ts` -- add transient `duck()`/`unduck()` that bypass the settings store and restore the pre-break value -- a persisted mute would outlive the reload
- [x] `client/src/main.ts` -- swap the adapter at the single construction site; delete the consent-card mount and its deploy-door teardown; wire the audio duck into the adapter -- one seam, one site
- [x] `client/vite.config.ts` -- NEW `hc-adsense` plugin with a PURE exported transform: emit `ads.txt`, inject the consent-default block then the loader into `index.html` head, both only when configured -- keeps the source HTML pure so the existing third-party-origin guard stays green unmodified
- [x] `client/src/analytics/consent.ts` -- ADVANCED defaults: global grants analytics + ads, EEA/UK/CH denies all four; `consentUpdate` becomes the LOCAL override -- the CMP owns the EEA decision
- [x] `client/src/analytics/index.ts` -- activate at boot regardless of stored choice; retire the pre-consent queue; a stored `denied` sends a denying update -- the pre-consent window no longer exists
- [x] `client/src/ui/consentBar.ts`, `client/src/__tests__/consentBar.test.ts` -- DELETE both -- retired, not adapted, in the cycle-69 grey-NO-DATA style
- [x] `client/src/ui/settings.ts` -- drop the `hideConsentBar` call; PRIVACY row otherwise unchanged -- R15's withdraw path is now the ONLY in-product analytics door
- [x] `client/src/config.ts` -- reduce the `consent` block to `policyHref`; retire the z-1250 rung note -- no dead knobs survive
- [x] `client/privacy/policyCopy.ts` -- add Google's REQUIRED disclosures (third-party vendors incl. Google use cookies to serve ads on prior visits; Ads Settings opt-out pointer); rewrite the consent section for the CMP -- a hard AdSense requirement
- [x] `render.yaml` -- add `VITE_ADSENSE_CLIENT: ca-pub-8667818947296707` beside the GA var -- same not-a-secret precedent
- [x] `client/src/__tests__/ads.test.ts` -- NEW: cover every I/O Matrix row -- unconfigured inertness, blocked-script survival, duck restore, `ads.txt` content, injected region list equals `EEA_UK_CH_REGIONS`
- [x] `VERSION`, `package.json`, `CLAUDE.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- 0.17.107; correct CLAUDE.md's stale `PROTOCOL_VERSION` 40 → 41; stamp BOTH trackers -- every landed PR must update both

**Acceptance Criteria:**
- Given the publisher ID is unset, when the client builds, then no `ads.txt` is emitted, no Google ad
  origin appears in any built page, and the null adapter is used — byte-identical behaviour to today.
- Given the publisher ID is set, when the client builds, then `dist/ads.txt` reads exactly
  `google.com, pub-8667818947296707, DIRECT, f08c47fec0942fa0` and `dist/index.html` carries the
  consent defaults BEFORE the loader.
- Given a player dies and returns to port, when the ad break runs, then audio is muted for its
  duration and restored to its pre-break value, and exactly one reload occurs.
- Given ads are blocked and no callback ever fires, when the player returns to port, then the chain
  still completes via the 35 s cap and the player is never stranded.
- Given a live match is in progress, when any code path runs, then no ad surface exists — verified
  by the interstitial having exactly one call site, at death→return-to-port.
- Given `npm run check`, when it runs, then it is green with the consent-card tests retired and the
  new ad tests added.
- Given `client/scripts/loadCapture.mjs`, when it runs against the built client, then cold load to
  interactive home is re-measured against NFR2's ~10 s budget with the ad script present.

## Design Notes

**Why the build-time injection rather than a static tag or a runtime inject.** The AdSense loader
must be in `<head>` of the same document as the canvas (H5 requirement) and must be present for
Google's CMP to render at all. A static tag in `client/index.html` would trip the Story 7.2 guard
that asserts every shipped page carries exactly one `<script>` and only the two font origins — and
would leave a dead vendor tag in a fork's build. Injecting at build time when configured keeps the
SOURCE html pure (guard stays green, unmodified), makes an unconfigured build provably inert, and
puts `ads.txt` and the tag under one switch. The transform is a pure exported function so it is
unit-testable without running a build.

**Why the consent defaults are injected too, and pinned.** `gtag('consent','default',…)` must
precede every other Google script, and `adsbygoogle.js` is now first in the head — so the defaults
cannot live in a module that loads later, or the CMP's `update` could land before our `default` and
be overridden. Duplicating the 32-code region list into HTML is the desync class this project
exists to prevent, so a test asserts the injected list equals `EEA_UK_CH_REGIONS`.

**What the deletion of the consent card does NOT remove.** `hullcracker.consent` survives, with a
changed meaning: it was "the answer to our banner", it is now "a local analytics override". Absent
⇒ follow the CMP and the region defaults. This is what keeps R15's withdraw path real, and it is
now the only in-product analytics door.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, complexity ≤ 10
- `npm run check` -- expected: green; test count rises net of the retired consent-card battery
- `npm run build` -- expected: succeeds; `dist/ads.txt` absent without the env var, present with it
- `node client/scripts/loadCapture.mjs` -- expected: interactive home well inside NFR2's ~10 s

**Manual checks:**
- Built `dist/index.html`: consent-default block precedes the `adsbygoogle.js` tag; both absent in an
  unconfigured build.
- Eric-side, outside this repo: tick BOTH AdSense dashboard flags (advertising, then analytics) or
  EEA analytics consent is never collected.

## Spec Change Log

No `bad_spec` loopback was triggered. The review's highest-severity finding (a blocked ad script
costing every player 35 s per match) was classified `patch` rather than `intent_gap` deliberately,
and the reasoning is recorded because it is the kind of call that should be auditable: the I/O
Matrix row describing the blocked case as "`safeAdapter`'s 35 s cap resolves and the chain reloads"
is inside the read-only `<intent-contract>`, but the contract's own `Always` clause reads *"The
never-strand-the-player contract holds unconditionally."* There is exactly one reading of that
intent, and a 35 s freeze after every match violates it. The fix adds NO timeout — it makes a
synchronous determination of whether the SDK is present, which the contract's "Not configured ⇒
null adapter" row already anticipates — so it satisfies the matrix and the intent simultaneously.

## Review Triage Log

### 2026-08-19 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 17: (high 3, medium 8, low 6)
- defer: 4: (high 0, medium 4, low 0)
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[high]` `[patch]` **Found INDEPENDENTLY BY BOTH REVIEWERS.** A blocked ad script latched `ready` true, because `startAds` set it on a successful `push` into a plain `Array` — which always succeeds when `adsbygoogle.js` never loads. The `!isAdsReady()` fast-path therefore covered only the UNCONFIGURED build, never the BLOCKED one it names, so every ad-blocked player would have waited the full 35 s on a frozen results screen after EVERY match. `isAdsReady()` now means "the SDK actually arrived" (`onReady` fired, or the loader replaced the queue), so a blocked client resolves AT ONCE. No timer added — pinned by a test that resolves with the clock frozen.
  - `[high]` `[patch]` A stored "analytics ON" choice was silently dropped on every reload: `boot()` re-sent a consent update only for `denied`, and every RETURN TO PORT ends in `location.reload()`. The privacy policy explicitly claimed the stored choice overrides the region default — false in the granted direction until now. Both choices are re-asserted at boot.
  - `[high]` `[patch]` A throw inside the unduck (closed AudioContext on a backgrounded tab) escaped before `resolve()`, costing the 35 s cap again. Now `try/catch/finally` — the catch added beyond the reviewers' suggestion so the exception never continues into Google's own callback.
  - `[medium]` `[patch]` No validation of `VITE_ADSENSE_CLIENT`, in the module that argues a wrong `ads.txt` is worse than none. Now `^ca-pub-\d{16}$`; a malformed ID emits no `ads.txt` and injects nothing (verified with a deliberately nonsense value).
  - `[medium]` `[patch]` `ads.txt` was emitted even when the head injection silently no-oped, which would authorise Google to sell inventory on a page carrying no loader. The transform now reports whether it injected and the emit is gated on it.
  - `[medium]` `[patch]` `isGameIndexPath` opted IN by default against a hand-maintained denylist, so a future fourth page would silently receive the ad loader. Inverted to an allowlist matching only the game entry.
  - `[medium]` `[patch]` Pressing `M` during the break wrote the PERSISTED mute setting with no audible feedback (the duck holds gain at 0), leaving the player flipped afterwards. `toggleMute()` is now inert while the break duck is active.
  - `[medium]` `[patch]` Policy claim false for the non-EEA majority: "Until that dialog is answered, nothing is stored on your device for advertising" — outside the EEA/UK/CH no dialog is ever shown while the global default grants all three ad signals from the first byte. Split into the two real cases.
  - `[medium]` `[patch]` Policy said the ad appears "after your match has ended", but ABANDON MATCH reaches the same chain from a live match. Reworded to "when you leave a match — whether it ended or you chose to abandon it".
  - `[medium]` `[patch]` Policy claimed analytics data is not used to choose advertising, a claim weakened by granting the ad signals. Narrowed to what we actually control: we never send Google anything about a match for advertising purposes.
  - `[medium]` `[patch]` Layering inversion — `analytics/ga.ts` imported the ADS layer for one marker string, linking the vendor origin into an unconfigured build and leaving one import from closing a cycle. Marker moved to a zero-import leaf module; the containment test narrowed back rather than left widened.
  - `[medium]` `[patch]` The perf record stated something false about itself — the exact failure its own new field exists to prevent. It claimed analytics cost was included when the measured build carried no GA ID, and filed a 7.4 run under `story: '7.1'`. Both corrected, and the run re-taken with BOTH IDs set.
  - `[low]` `[patch]` `thirdPartyOrigins` added to the load record (it recorded font origins but not the ad origin, so a run could not prove which scripts it fetched). This immediately revealed the loader pulls in FIVE Google origins, not one, which drove a matching policy disclosure.
  - `[low]` `[patch]` A `hooks.muted()` throw silently disabled the whole ad layer for the session; now defaults to `sound: 'on'`.
  - `[low]` `[patch]` `lastBreakStatus()` was a recorded value with no reader — a dead knob by this project's own cycle-69 rule. Given a real consumer: one `console.info` per break behind `import.meta.env.DEV`, verified absent from the production bundle.
  - `[low]` `[patch]` Unescaped interpolation into the one inline script the whole consent design depends on. `<` now escaped; pinned with a hostile payload.
  - `[low]` `[patch]` Two doc comments were untrue (static pages "load no Google anything" — they load Google Fonts; the `muted()` hook described as the "REAL" mute state when `adConfig` is called once at boot and is un-resettable). Both corrected, plus the two consent-default orderings aligned so the ads and ads-less paths state one contract identically.

## Auto Run Result

Status: done. See the ship report for the full narrative; in brief — the interstitial ships behind
the Epic 0 seam with no display units anywhere, Google's certified CMP replaces the self-built
consent card, Consent Mode moves BASIC → ADVANCED, and `ads.txt` plus the loader are injected at
build time under `VITE_ADSENSE_CLIENT`. Everything is dormant until the H5 application is approved.

Verification: `npm run check` green at **5221 tests** (shared 746 / server 1489 / client 2986),
lint 0 errors. Three build states proven by inspection of `client/dist` — unconfigured (no
`ads.txt`, no injected origin), configured (exact `ads.txt` line, consent defaults BEFORE the
loader, static pages clean), and deliberately malformed (nothing emitted, nothing injected). NFR2
re-measured with BOTH third-party IDs present: interactive home **2531 ms** against the ~10 s
budget, 8 third-party origins recorded, bundle 314.2 kB gzipped (**+3.4 kB** over Story 7-2).

Residual risks: the EEA consent story depends on two AdSense dashboard flags this repo cannot set
or test (fails safe — unticked means denied); H5 approval is submitted but pending, so the
interstitial cannot be exercised end to end yet; and four review findings are deferred, all needing
a live CMP or their own pass.
